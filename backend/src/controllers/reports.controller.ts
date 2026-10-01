import { Request, Response, NextFunction } from 'express';

/**
 * Controller stubs for managing infrastructure damage reports.
 */

export const getAllReports = async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {
  // Stub function: Will retrieve damage reports from database
  res.status(200).json({
    message: 'getAllReports stub',
    reports: [],
  });
};

export const getReportById = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { id } = req.params;
  // Stub function: Will retrieve report by ID from database
  res.status(200).json({
    message: 'getReportById stub',
    reportId: id,
  });
};

export const createReport = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  // Stub function: Will validate and persist new damage report
  res.status(201).json({
    message: 'createReport stub',
    data: req.body,
  });
};

export const getUserReports = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { userId } = req.params;
  // Stub function: Will retrieve reports submitted by specific citizen
  res.status(200).json({
    message: 'getUserReports stub',
    userId,
    reports: [],
  });
};

export const updateReportStatus = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  const { id } = req.params;
  // Stub function: Will update status (pending, in_progress, resolved)
  res.status(200).json({
    message: 'updateReportStatus stub',
    reportId: id,
    status: req.body.status,
  });
};
