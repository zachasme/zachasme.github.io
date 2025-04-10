---
layout: post
title:  "SQLite Daily Backups in Rails"
permalink: /sqlite-daily-backup-in-rails
date:   2024-09-12 09:50:00 +0200
categories: rails
redirect_from:
  - /2024/09/11/sqlite-daily-backup.html
---

This setup will:

- Do an online backup of the production database
- Compress using `gzip`
- Encrypt using `gpg`
- Upload to `S3`-compatible storage

First, prepare your `S3`-compatible bucket (and configure it to expire files older than, say, 1 week). Using [Cloudflare R2][r2], create a [new bucket][r2-bucket-new] and [API token][r2-api-tokens], then store them in your Rails credentials:

```yaml
# rails credentials:edit
daily_backup:
  passphrase: # used for gpg encryption, store in password manager
  bucket: https://ACCOUNT_ID.eu.r2.cloudflarestorage.com/BUCKET
  access_key_id: # ...
  secret_access_key: # ...
```

Then, add the following job:

```ruby
# app/jobs/daily_backup_job.rb
class DailyBackupJob < ApplicationJob
  def perform
    filename = "production-#{Date.current}.sqlite3"
    filepath = "tmp/storage/#{filename}"

    # add these to your rails credentials file nested in `daily_backup`
    Rails.application.credentials.daily_backup => {
      passphrase:,
      bucket:,
      access_key_id:,
      secret_access_key:
    }

    system "sqlite3 storage/production.sqlite3 '.backup #{filepath}'" or raise "backup failed"
    system "gzip --force #{filepath}" or raise "gzip failed"
    system "gpg --yes --batch --passphrase='#{passphrase}' --output '#{filepath}.gz.gpg' -c '#{filepath}.gz'" or raise "gpg failed"
    system "curl --aws-sigv4 'aws:amz:auto:s3' --user '#{access_key_id}:#{secret_access_key}' --upload-file #{filepath}.gz.gpg #{bucket}/#{filename}.gz.gpg" or raise "curl failed"
  end
end
```

Finally, schedule the job to run daily. Using [SolidQueue][solid_queue] this is as simple as:

```yaml
# config/recurring.yml
production:
  daily_backup:
    class: DailyBackupJob
    schedule: at 5am every day
```

That's it!

When your production database blows up, you now have a basic means of disaster recovery, assuming you don't loose your `GPG` passphrase (which you stored in your password manager, right?).

[solid_queue]: https://github.com/rails/solid_queue
[r2-api-tokens]: https://dash.cloudflare.com/?to=/:account/r2/api-tokens
[r2-bucket-new]: https://dash.cloudflare.com/?to=/:account/r2/new
[r2]: https://developers.cloudflare.com/r2/