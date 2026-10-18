import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

import '../models/pending_report_model.dart';

/// SQLite database helper managing the local offline queue for damage reports.
class SQLiteHelper {
  static const _databaseName = 'fixmycity_local.db';
  static const _databaseVersion = 2;
  static const tablePendingReports = 'pending_reports';

  SQLiteHelper._privateConstructor();
  static final SQLiteHelper instance = SQLiteHelper._privateConstructor();

  /// Testing constructor for mocks and fakes.
  SQLiteHelper.internal();

  /// Factory constructor to support dependency injection in tests.
  factory SQLiteHelper({Database? db}) {
    if (db != null) {
      instance._customDatabase = db;
    }
    return instance;
  }

  Database? _customDatabase;
  static Database? _database;

  /// Returns the singleton [Database] instance, initializing it if necessary.
  Future<Database> get database async {
    if (_customDatabase != null) return _customDatabase!;
    if (_database != null) return _database!;
    _database = await _initDatabase();
    return _database!;
  }

  Future<Database> _initDatabase() async {
    final documentsDirectory = await getApplicationDocumentsDirectory();
    final path = p.join(documentsDirectory.path, _databaseName);

    return await openDatabase(
      path,
      version: _databaseVersion,
      onCreate: _onCreate,
      onUpgrade: _onUpgrade,
    );
  }

  Future<void> _onCreate(Database db, int version) async {
    await db.execute('''
      CREATE TABLE $tablePendingReports (
        id TEXT PRIMARY KEY,
        image_file_path TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        issue_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      )
    ''');
  }

  Future<void> _onUpgrade(Database db, int oldVersion, int newVersion) async {
    if (oldVersion < 2) {
      final columns = await db.rawQuery('PRAGMA table_info($tablePendingReports)');
      final hasNotes = columns.any((col) => col['name'] == 'notes');
      if (!hasNotes) {
        await db.execute('ALTER TABLE $tablePendingReports ADD COLUMN notes TEXT');
      }
    }
  }

  /// Inserts a new report into the offline queue.
  Future<void> insertPendingReport(PendingReport report) async {
    final db = await database;
    await db.insert(
      tablePendingReports,
      report.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// Retrieves all pending reports from SQLite.
  ///
  /// If [autoRetryableOnly] is true, only returns reports that have not exceeded
  /// the max auto-retry threshold (<= 5 retries) and are not currently locked in 'syncing'.
  Future<List<PendingReport>> getAllPendingReports({
    bool autoRetryableOnly = false,
  }) async {
    final db = await database;
    final List<Map<String, dynamic>> maps;

    if (autoRetryableOnly) {
      maps = await db.query(
        tablePendingReports,
        where: 'sync_status != ? AND retry_count <= ?',
        whereArgs: ['syncing', 5],
        orderBy: 'created_at ASC',
      );
    } else {
      maps = await db.query(
        tablePendingReports,
        orderBy: 'created_at ASC',
      );
    }

    return maps.map((map) => PendingReport.fromMap(map)).toList();
  }

  /// Fetches a single pending report by its local UUID.
  Future<PendingReport?> getPendingReportById(String id) async {
    final db = await database;
    final List<Map<String, dynamic>> maps = await db.query(
      tablePendingReports,
      where: 'id = ?',
      whereArgs: [id],
      limit: 1,
    );

    if (maps.isEmpty) return null;
    return PendingReport.fromMap(maps.first);
  }

  /// Updates the sync status and optional error message of a report.
  Future<void> updateReportStatus(
    String id,
    String status, {
    String? error,
  }) async {
    final db = await database;
    final values = <String, dynamic>{
      'sync_status': status,
    };
    if (error != null) {
      values['last_error'] = error;
    }

    await db.update(
      tablePendingReports,
      values,
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  /// Increments the retry counter for a failing report.
  Future<void> incrementRetryCount(String id) async {
    final db = await database;
    await db.rawUpdate('''
      UPDATE $tablePendingReports
      SET retry_count = retry_count + 1
      WHERE id = ?
    ''', [id]);
  }

  /// Deletes a successfully synced report from the local queue.
  Future<void> deletePendingReport(String id) async {
    final db = await database;
    await db.delete(
      tablePendingReports,
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  /// Returns the total count of reports waiting to sync.
  Future<int> getPendingReportsCount() async {
    final db = await database;
    final result = await db.rawQuery(
      'SELECT COUNT(*) as count FROM $tablePendingReports',
    );
    return Sqflite.firstIntValue(result) ?? 0;
  }

  /// For testing/debugging: drops all records in pending_reports.
  Future<void> clearAll() async {
    final db = await database;
    await db.delete(tablePendingReports);
  }
}
