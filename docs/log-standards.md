# Log standards

How a process writes logs. `pnpm lint` enforces the rules marked **(lint)**, `pnpm test` the ones marked **(test)**; the rest are checked in review. A rule marked **(planned)** is not enforced yet: the code does not do it today, and an issue will add what it needs. Each rule is one line.

The rules do not depend on the product. To use this file in another project, copy it, keep the rules and the tables, and replace the examples (the lines that say "e.g.") with the project's own. The sources are at the end.

## Levels

There are four levels, ordered from the least to the most verbose: `error`, `warn`, `info`, `debug`. A level is chosen by what the reader has to do, not by how the code feels.

| Level | The reader | Use it when | e.g. |
| --- | --- | --- | --- |
| `error` | Acts | An operation failed and did not do what was asked, or the process cannot continue. | A load failed after its last retry. |
| `warn` | Watches | Something unexpected happened and was handled; the work went on, maybe degraded. It becomes an error if it repeats. | A request was retried and then worked; a source answered with a rate limit; a deprecated setting was read. |
| `info` | Nothing | A normal and significant event in the life of the process, one line per unit of work, never per item. | The process started; a load finished with its counts and duration. |
| `debug` | Diagnoses | Detail a developer needs to follow a decision or a timing. Off by default; the system is understood as healthy without it. | The query plan chosen; the size of a response. |

The levels map to the standards the logs are sent to, so a collector does not have to guess.

| Level | Syslog (RFC 5424) | OpenTelemetry `SeverityNumber` |
| --- | --- | --- |
| `error` | 3 `error` | 17 `ERROR` |
| `warn` | 4 `warning` | 13 `WARN` |
| `info` | 6 `informational` | 9 `INFO` |
| `debug` | 7 `debug` | 5 `DEBUG` |

- **Four levels, in this order, and no other (test).** A threshold keeps its level and the more severe ones: `info` shows `info`, `warn` and `error`. No level hides `error`.
- **The level is set by one environment variable, read in one place (test).** A value outside the four names fails at startup with a message that lists them. The default is `info`.
- **An error is logged once, by the code that handles it (review).** The code below throws or returns; the layer that decides what happens logs. The same failure is not logged again at each layer it crosses.
- **A failure that was recovered is `warn`; one that was not is `error` (review).** A retry logs `warn` on each failed attempt and `error` only when the attempts run out.
- **An outcome the caller caused is not an `error` (review).** An invalid input or a missing item goes back to the caller in the response and is logged at `debug`; a refusal by a security rule is `warn`, with the name of the rule and never the whole request.
- **A repeated `warn` is a signal, not noise (review).** If it never needs a person, lower it; if it always does, raise it.
- **No level is used for flow control or as a progress bar (review).** A loop logs a summary at `info` and the detail, if any, at `debug`.
- **`debug` is safe to turn on in production (test).** It follows every rule in "What never goes in a log".

## Format

- **One event is one line of JSON (test).** The fields `time` (UTC, ISO 8601), `level` and `event` are always there; the rest are the event's own fields. e.g. `{"time":"2026-11-11T12:00:00.000Z","level":"info","event":"load.finished","loadingId":"a1","durationMs":840}`. The line has no colors and no multiple lines. **(planned)** for `time`.
- **An event name is stable, lowercase and dotted: `area.thing.outcome` (review).** e.g. `load.notice.failed`. A name is never built from data, so a search for it always finds the same event. **(planned)** for the existing names that do not follow it.
- **The name says what happened; the data goes in fields (review).** No string is concatenated into the name. A person reading a line reads the `event`; a machine filters on its fields.
- **A field name is camelCase and says the kind of value (review).** A unit is in the name: `durationMs`, `sizeBytes`. The same fact has the same name in every event.
- **A field value is a string, a number or a boolean (test).** No object, no array and no stack trace. An absent value is left out, not written as `null` or `""`.
- **A value that comes from outside is data: it is escaped and cut to a maximum length (planned).** Newlines and control characters never forge a second line, and a long value is cut and marked as cut.
- **A stack is only at `debug` (review).** The detail of an `error` is the name and the message of the error, redacted and cut.

## Where logs go

- **The process writes the stream and nothing else (review).** It never opens, rotates or deletes a log file; where logs are kept, for how long and who reads them is the platform's, not the app's.
- **A process whose standard output carries a protocol writes logs to the error stream (lint).** e.g. a stdio server: nothing writes to the standard output, and no `console` call exists.
- **Writing a log line never throws and never stops the work (planned).** A failed write is dropped.

## What never goes in a log

- **No secret (test).** An API key, a token, a password, a connection string, the value of an environment variable and an authorization header never appear. Every string that reaches a log goes through the redaction helper, and each new output path has a test with a fake secret.
- **No personal data and no private content (review).** A request body, a user's text and the text of a document are not logged; a size and a short id are. When a person must be recognized, a stable id or a hash is used, never the name or the address.
- **Internal paths and addresses only when someone has to act on them (review).** A host of an external service is fine in a line that names the failure; a path on disk or a private address is not.
- **Text from a third party is data (review).** A line may say that a document had a problem, never repeat an instruction found in it.

## What to log

- **A process logs its start, its stop and the names of the settings it read at `info` (review).** Names, never values.
- **A unit of work that can fail ends with one `info` line (result, counts, duration) or one `error` line (the cause) (review).** Its start, if needed, is `debug`.
- **A call to an outside service that fails names the service and the cause (review).** "The source answered with a rate limit", not "request failed".
- **A security-relevant event is always at least `warn` or `info` (review).** Authentication failures, refusals by a rule and the use of a high-risk function; they are not the first thing a lower threshold hides.
- **A log is sized to its reader (review).** Too little cannot explain an incident; too much hides it. Before a new line, name who reads it and what they do.

## Sources

- OWASP, Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html (what to log, what to exclude, log injection, retention).
- The Twelve-Factor App, XI. Logs: https://12factor.net/logs (a stream, not files).
- RFC 5424, The Syslog Protocol, section 6.2.1: https://datatracker.ietf.org/doc/html/rfc5424#section-6.2.1 (severity levels).
- OpenTelemetry, Logs Data Model: https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/logs/data-model.md (`SeverityNumber` ranges).
- Model Context Protocol, Logging: https://modelcontextprotocol.io/specification/latest/server/utilities/logging (the levels follow RFC 5424; a log must not carry secrets or personal data; the feature is deprecated from the 2026-07-28 revision in favor of the error stream for stdio or OpenTelemetry).
