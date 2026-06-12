using Wiseravenshare.Server.Services;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);
var clientOrigin = builder.Configuration["CLIENT_ORIGIN"];
var defaultConnectionString = builder.Configuration.GetConnectionString("DefaultConnection");

builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddScoped<IYouTubeService, YouTubeService>();
builder.Services.AddCors(options =>
{
    options.AddPolicy("ClientPolicy", policy =>
    {
        if (!string.IsNullOrWhiteSpace(clientOrigin))
        {
            policy.WithOrigins(clientOrigin).AllowAnyHeader().AllowAnyMethod();
        }
        else
        {
            policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
        }
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseHttpsRedirection();
}

app.UseCors("ClientPolicy");
app.UseAuthorization();
app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapGet("/health/db", async () =>
{
    if (string.IsNullOrWhiteSpace(defaultConnectionString))
    {
        return Results.Problem("DefaultConnection is not configured.", statusCode: StatusCodes.Status500InternalServerError);
    }

    try
    {
        await using var connection = new NpgsqlConnection(defaultConnectionString);
        await connection.OpenAsync();

        await using var command = new NpgsqlCommand("SELECT 1", connection);
        var result = await command.ExecuteScalarAsync();

        return Results.Ok(new { status = "ok", database = "postgres", result });
    }
    catch (Exception ex)
    {
        return Results.Problem($"Database connectivity check failed: {ex.Message}", statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});

app.Run();
