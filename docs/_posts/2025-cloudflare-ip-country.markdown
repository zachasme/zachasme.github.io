---
layout: post
title:  "Rails & Cloudflare IP Country"
permalink: /cloudflare-ip-country
date:   2025-03-07 14:11:00 +0200
categories: rails
---

# IP geolocation in Rails using Cloudflare

If you are using Cloudflare DNS, with proxying enabled, Cloudflare will enrich requests with the ip country code.

```ruby
request.headers["CF-IPCountry"]
```

However, this will not in development. Instead we can "fake" it using a middleware that asks cloudflare for the country of the development machine:

```ruby
# lib/middleware/cloudflare_ip_country_faker.rb
class CloudflareIpCountryFaker
  # For use in development, will pretend to be behind cloudflare
  # using ip and country of the development machine as seen by CF
  def initialize(app)
    @app = app
    response = Net::HTTP.get("cloudflare.com", "/cdn-cgi/trace")
    @trace = Hash[response.scan(/(.*)=(.*)/)]
  end

  def call(env)
    env["HTTP_X_FORWARDED_FOR"] = @trace["ip"]
    env["HTTP_CF_IPCOUNTRY"] = @trace["loc"]
    @app.call(env)
  end
end

# config/environments/development.rb
require "middleware/cloudflare_ip_country_faker"

Rails.application.configure do
  # ...
  config.middleware.insert_before ActionDispatch::RemoteIp, CloudflareIpCountryFaker
  # ...
end

# config/application.rb
# ...
config.autoload_lib(ignore: %w[assets tasks middleware])
# ...
```
