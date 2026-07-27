# Shared product UI

Shared helpers are presentation-only and must not own product state, auth,
routing or API behavior. Escape all user/API-derived content. Inline SVG icons
may accept developer-owned literal markup only. A shared change must be built
and smoke-checked in every consuming product.
