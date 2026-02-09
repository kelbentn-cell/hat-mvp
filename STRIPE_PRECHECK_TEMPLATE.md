# Stripe Pre-Check Message (Template)

Subject: Pre-launch compliance check for digital provenance token store

Hello Stripe Support Team,

I am preparing to launch a small digital product called **HAT (Human Authentication Token)** and want to confirm policy alignment before enabling live payments.

Business model summary:
- We sell one-time digital tokens at fixed prices (for example: `HAT-000101`).
- Each paid order issues exactly one unique token number from our private registry.
- Buyer can optionally publish that token in their own content as a provenance marker.
- We expose a public endpoint that only confirms token validity and issuance timestamp.
- We do **not** sell followers, engagement, traffic, fake reviews, or impersonation tools.
- We do **not** claim government identity verification, KYC identity proofing, or legal identity guarantees.
- We do **not** handle high-risk categories such as crypto custody, gambling, adult content, or regulated financial products.

What customers receive:
- A one-time digital entitlement (token ID) and optional downloadable certificate PDF.
- The certificate states this is a digital provenance record, not legal identity verification.

Risk controls:
- Private issuance log in our database.
- One token per successful paid order, no duplicates.
- Public verification endpoint only returns token validity + timestamp (+ optional public display name if enabled for specific premium tiers).
- Refund policy and support contact are shown on site.

Could you confirm this use case is acceptable under Stripe’s restricted business and card-network rules?

If any product wording or implementation should be adjusted before launch, I can update it immediately.

Thank you.
