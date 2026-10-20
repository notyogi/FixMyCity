import { Prisma } from '@prisma/client';
import prisma from '../utils/prisma';

/**
 * Interface representing a nearby candidate report returned by geospatial proximity search.
 */
export interface NearbyReport {
  id: string;
  image_url: string;
  image_hash: string | null;
  lat: number;
  lng: number;
  issue_type: string;
  severity: string;
  status: string;
  cluster_id: string | null;
  created_at: Date;
  distance_meters: number;
}

/**
 * Custom exception thrown when proximity query execution fails.
 */
export class ProximityQueryException extends Error {
  public readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ProximityQueryException';
    this.cause = cause;
    Object.setPrototypeOf(this, ProximityQueryException.prototype);
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PERFORMANCE & ARCHITECTURAL NOTE:
 * Currently, lat and lng are stored as plain Float (DOUBLE PRECISION) columns on the
 * reports table rather than a native PostGIS geography column. The proximity query computes
 * geography casts on the fly using ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography.
 *
 * While a composite btree index on (lat, lng) exists on the reports table as an initial
 * optimization, on-the-fly casting means ST_DWithin cannot utilize a native spatial index
 * (GiST). For Phase 1 scope with moderate datasets this executes rapidly, but as the reports
 * table grows into tens/hundreds of thousands of rows, this on-the-fly calculation will
 * incur sequential scans and increased query latency.
 *
 * KNOWN FUTURE OPTIMIZATION:
 * Add a generated/persisted PostGIS geography column (e.g. `location geography(Point, 4326)
 * GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) STORED`) with a
 * GiST spatial index (`CREATE INDEX reports_location_gist_idx ON reports USING GIST(location)`).
 * This will enable index-accelerated ST_DWithin scans at scale without altering the Float-based
 * Prisma schema interface.
 */
export class ProximityService {
  /**
   * Find existing "open" reports within a given radius (meters) using PostGIS ST_DWithin.
   * "Open" reports means status NOT IN ('FIXED', 'REJECTED') (i.e. SUBMITTED, UNDER_REVIEW, SCHEDULED).
   *
   * @param lat Latitude of the target coordinate
   * @param lng Longitude of the target coordinate
   * @param radiusMeters Search radius in meters (defaults to 25m)
   * @param excludeReportId Optional report ID to exclude (e.g. newly created report row)
   * @returns Array of NearbyReport candidate objects ordered by distance ascending
   */
  static async findNearbyOpenReports(
    lat: number,
    lng: number,
    radiusMeters: number = 25,
    excludeReportId?: string
  ): Promise<NearbyReport[]> {
    try {
      // Conditionally append exclude clause if a valid UUID is provided
      const excludeClause =
        excludeReportId && UUID_REGEX.test(excludeReportId)
          ? Prisma.sql`AND id != ${excludeReportId}::uuid`
          : Prisma.empty;

      // Note: ST_MakePoint takes (longitude, latitude) in that order.
      // Cast to ::geography ensures ST_DWithin & ST_Distance operate in meters instead of degrees.
      const reports = await prisma.$queryRaw<NearbyReport[]>`
        SELECT
          id,
          image_url,
          image_hash,
          lat,
          lng,
          issue_type,
          severity,
          status,
          cluster_id,
          created_at,
          ST_Distance(
            ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
          ) AS distance_meters
        FROM reports
        WHERE status NOT IN ('FIXED', 'REJECTED')
          AND ST_DWithin(
            ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusMeters}
          )
          ${excludeClause}
        ORDER BY distance_meters ASC;
      `;

      return reports.map((report) => ({
        ...report,
        distance_meters: Number(report.distance_meters),
      }));
    } catch (error) {
      console.error(
        `[ProximityService] Failed to find nearby open reports near (${lat}, ${lng}) within ${radiusMeters}m:`,
        error instanceof Error ? error.message : error
      );
      throw new ProximityQueryException(
        `Failed to execute geospatial proximity query at (${lat}, ${lng}) within ${radiusMeters}m`,
        error
      );
    }
  }
}

export const findNearbyOpenReports = ProximityService.findNearbyOpenReports;
