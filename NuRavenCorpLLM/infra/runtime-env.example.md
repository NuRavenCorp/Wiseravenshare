# Final Database ENV Mapping

Use one DigitalOcean PostgreSQL cluster and give each site its own `-app` database.

## WiseRavenShare

```text
ConnectionStrings__DefaultConnection=postgresql://wiseravenshare_app:<password>@db-pgsql-nyc1-15936-do-user-38566490-0.i.db.ondigitalocean.com:25060/wiseravenshare-app?sslmode=require
```

## VoterAlliance

```text
ConnectionStrings__DefaultConnection=postgresql://voteralliance_app:<password>@db-pgsql-nyc1-15936-do-user-38566490-0.i.db.ondigitalocean.com:25060/voteralliance-app?sslmode=require
```

## WiseRavenStream

```text
ConnectionStrings__DefaultConnection=postgresql://wiseravenstream_app:<password>@db-pgsql-nyc1-15936-do-user-38566490-0.i.db.ondigitalocean.com:25060/wiseravenstream-app?sslmode=require
```

## Notes

- Do not use `doadmin` in app ENV in production.
- Keep `sslmode=require` enabled.
- Replace `<password>` with the rotated password for each site-specific DB user.
