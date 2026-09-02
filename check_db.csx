using Microsoft.Extensions.Configuration;
using Npgsql;
using System.IO;
using System;

var builder = new ConfigurationBuilder()
    .SetBasePath(Directory.GetCurrentDirectory())
    .AddJsonFile("appsettings.json");
var config = builder.Build();
var connStr = config.GetConnectionString("DefaultConnection");

Console.WriteLine($"Conn: {connStr}");

try {
    using var conn = new NpgsqlConnection(connStr);
    conn.Open();
    var sql = "SELECT to_regclass('app_data.app_users') IS NOT NULL AND has_table_privilege('app_data.app_users', 'INSERT');";
    using var cmd = new NpgsqlCommand(sql, conn);
    var exists = cmd.ExecuteScalar();
    Console.WriteLine($"Exists: {exists}");
} catch (Exception ex) {
    Console.WriteLine(ex);
}

