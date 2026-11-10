# A callback when a background load finishes, to a URL the caller gives

Date: 2026-11-11.

A query that needs a long load answers at once with the rows stored so far and a loading id (ADR 0022). The agent repeats the query until no load runs. Nothing tells an agent that is not in a loop when a load ends, so it has no signal to come back.

## Decision

- A new tool, `notify_load_finish`, takes a loading id and a `callback_url`. When that load leaves the running state, the server sends one HTTP POST to the URL. The URL is given by the caller on each call; the operator does not list them.
- The POST body is JSON with only: the loading id, the category, the asset id, the status (`loaded` or `failed`), the rows written, and the error when there is one. It never carries rows, values or documents.
- The notice is sent for a failed load as well as for a loaded one, so the caller learns that it did not succeed.
- The POST goes to `https` only, with no redirects followed, one attempt with a 10-second timeout. A notice that cannot be delivered is logged with the host only, never with the path or the query.
- No signature is added to the notice. The receiver trusts the URL it gave.
- The server's rule "the server never writes to the outside world" is replaced by: the server writes only to its own cache file, and sends a notice only to a URL the caller gives in `notify_load_finish`. Nothing else leaves the server.

## Consequences

- This is a deliberate break of the rule that the server has no outbound call. The tool is the only place it happens, and it sends metadata only.
- Risk accepted by the owner: a document can contain text that asks the agent to send results to another address. The server does not check the intent of the caller. The bodies stay metadata-only, which limits what can leave, to the loading id, asset id and status. The owner accepts this.
- The tool is not read-only in its effect outside the server. The tool description says so.
- The HTTP POST is a new output path; it is covered by the redaction rule (the URL's query and path are never logged) and a test with a fake secret in the URL.
- Not decided here: push by a webhook session (`watch_url`) is the caller's choice; the server does not depend on it.

## Alternatives

- Keep polling with the query: works now, no new surface.
- MCP progress notifications: no network exit, but a client may not show them.
- A status tool (`get_load_status` with the loading id): cheaper polling, no push.
