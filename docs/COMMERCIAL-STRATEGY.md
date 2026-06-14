# AAAStreamer Commercial Strategy

## Approved Product Models

AAAStreamer has three approved commercial product models:

1. AAAStreamer Hosted
2. AAAStreamer Self-Hosted Licensed
3. AAAStreamer Managed Deployment

Community Edition is not part of the current launch plan.

Revisit a Community Edition only after:

- stable commercial launch
- stable documentation
- stable support process
- proven recurring revenue

## Pricing Direction

AAAStreamer Hosted:

- $14.99 to $99 per month

AAAStreamer Self-Hosted:

- $99 setup
- $9.99 to $49 per month license

AAAStreamer Managed:

- $149 to $499 per month

Enterprise and network deployments:

- custom pricing

These are product strategy ranges, not a billing implementation. Actual WHMCS
products, coupons, trials, taxes, and payment terms should be configured in the
billing system and documented separately.

## Licensing Model

All customer-owned AAAStreamer installations require licensing.

License validation should use:

- WHMCS integration
- signed license tokens
- cryptographic verification
- domain validation
- hardware fingerprinting where appropriate
- secure API validation

The licensing system must not rely only on a plain text license key or a
client-side setting. License validation must be server-verifiable and tamper
resistant.

## Offline Operation

AAAStreamer must allow offline operation.

Requirements:

- daily validation attempts
- 60-day grace period
- user notifications at 30, 45, and 55 days without successful validation
- no immediate shutdowns
- existing streams continue functioning during the grace period
- premium functionality may become limited after grace expiration

Grace expiration should degrade carefully. It must not abruptly break active
streams or leave customers without a clear path to restore validation.

## Internal Licensing

Devine Creations infrastructure receives unrestricted internal enterprise
licensing:

- unlimited stations
- unlimited users
- unlimited administrators
- unlimited bandwidth
- unlimited storage
- unlimited integrations

No restrictions apply to internal enterprise deployments.

## Deployment Models

### Hosted

Infrastructure is hosted by Devine Creations.

Hosted deployments are the first commercial priority. They should minimize
customer setup work and keep updates, monitoring, support, storage, and domain
configuration under the platform operator's control.

### Self-Hosted Licensed

The customer installs and manages the infrastructure.

Self-hosted installs require a valid license and should validate against the
licensed domain and install identity. Self-hosted customers are responsible for
their own infrastructure unless they purchase a managed service.

### Managed Deployment

The customer owns the infrastructure. Devine Creations installs, configures,
updates, secures, and supports the deployment.

Managed deployments should have documented access, update, monitoring, backup,
and support boundaries before launch.

## Desktop Client

Desktop client development continues.

Targets:

- Windows
- macOS

Future target:

- Linux

The desktop client should eventually provide:

- broadcast management
- monitoring
- queue management
- scheduling
- administration
- accessibility enhancements

## Compatibility

AAAStreamer must maintain compatibility with:

- OBS Studio
- Audio Hijack
- RTMP workflows
- standard streaming encoders

Compatibility with existing creator workflows is a core product requirement.
AAAStreamer should not require creators to abandon their current broadcast
software when standard RTMP ingestion is sufficient.

## Accessibility

Accessibility remains a primary product differentiator.

Requirements:

- screen reader support
- full keyboard access
- accessible administration
- accessible monitoring
- accessible broadcasting workflows

Accessibility requirements apply to hosted, self-hosted, managed, and desktop
client experiences.

## Marketing Position

Primary message:

```text
Own your station.
Own your audience.
Own your content.
```

AAAStreamer is not merely a streaming application. AAAStreamer is
creator-owned broadcasting infrastructure.

## Future Integrations

Planned or expected integrations:

- VoiceLink
- TCast
- WHMCS
- FlexPBX
- TappedIn.fm
- future AI systems

## Development Priority

Focus development on:

1. Hosted platform
2. Self-hosted licensed edition
3. Managed deployment services

Delay community edition until the commercial platform is mature enough to
support it without weakening hosted, licensed, or managed delivery.
