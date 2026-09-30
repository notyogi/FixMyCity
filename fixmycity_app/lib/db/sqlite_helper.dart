import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';
import '../models/report_model.dart';

/// Helper service for local SQLite storage and offline report synchronization queue.
class SQLiteHelper {
  static const _databaseName = 'fixmycity.db';
  static const _databaseVersion = 1;
  static const tableName = 'offline_reports';

  SQLiteHelper._privateConstructor();
  static final SQLiteHelper instance = SQLiteHelper._privateConstructor();

  static Database? _database;

  Future<Database> get database async {
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
    );
  }

  Future<void> _onCreate(Database db, int version) async {
    await db.execute('''
      CREATE TABLE $tableName (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        address TEXT,
        image_url TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        is_synced INTEGER NOT NULL DEFAULT 0,
        user_id TEXT
      )
    ''');
  }

  /// Insert or replace a report in local storage (e.g. when offline).
  Future<int> insertReport(ReportModel report) async {
    final db = await database;
    return await db.insert(
      tableName,
      report.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// Retrieve all reports waiting to be synced to the backend server.
  Future<List<ReportModel>> getUnsyncedReports() async {
    final db = await database;
    final List<Map<String, dynamic>> maps = await db.query(
      tableName,
      where: 'is_synced = ?',
      whereArgs: [0],
      orderBy: 'created_at ASC',
    );
    return maps.map((map) => ReportModel.fromMap(map)).toList();
  }

  /// Retrieve all cached reports.
  Future<List<ReportModel>> getAllReports() async {
    final db = await database;
    final List<Map<String, dynamic>> maps = await db.query(
      tableName,
      orderBy: 'created_at DESC',
    );
    return maps.map((map) => ReportModel.fromMap(map)).toList();
  }

  /// Mark a previously queued report as successfully synced.
  Future<int> markAsSynced(String id) async {
    final db = await database;
    return await db.update(
      tableName,
      {'is_synced': 1},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  /// Delete a report by ID from local cache.
  Future<int> deleteReport(String id) async {
    final db = await database;
    return await db.delete(
      tableName,
      where: 'id = ?',
      whereArgs: [id],
    );
  }
}
