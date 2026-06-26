# Notification Payloads

NUVO notification navigation uses `notification_logs.data` as the source of truth. For sent push notifications, `notification_logs.data` and Expo Push `payload.data` must have the same structure.

This document records the current payload contract and the recommended shape for future notification work. It does not describe a migration or an implementation change.

## Common Rules

- `notification_logs.data` is the source of truth for in-app notification history and push notification navigation.
- Sent Expo Push `payload.data` must match the saved `notification_logs.data`.
- `dedupe_key` is only for duplicate prevention. It must not be used for screen navigation.
- `notification_type` must not be used as a fallback navigation source.
- The current supported `screen` values are `report` and `record`.
- `screen` determines the target tab for notification clicks.
- `target_date` is used for record navigation.
- `base_date` is used as the analysis/report reference date.
- `notification_log_id` is used only as an optional helper for marking a pushed notification as read after a push click.
- Sensitive values must not be included in payload data, including push tokens, auth tokens, internal error stacks, or raw provider responses.

## Current Mobile Usage

`apps/mobile/src/nuvo/utils/pushNotifications.js` reads:

- `screen`: required for navigation. Only `report` and `record` are accepted.
- `type`: copied into the resolved target for bookkeeping only.
- `target_date`: used only when `screen === "record"`.
- `analysis_request_id`: copied when `screen === "report"`.
- `analysis_result_id`: copied when `screen === "report"`.
- `notification_log_id`: read from push click payloads only to call the mark-read API.

The resolver does not use `notification_log_id`, `dedupe_key`, `notification_type`, `target_type`, or `target_id` for navigation.

`apps/mobile/src/nuvo/screens/mypage/NotificationHistoryScreen.jsx` reads:

- `log.data`: passed to the same resolver used by push clicks.
- `log.notification_type`: used only to choose the row icon.
- `log.read_at`: used only for read/unread display state.

## Current Sender Behavior

`apps/backend/app/services/notification_sender.py` builds `payload_data` before sending. It starts with:

```json
{
  "type": "<notification_type>",
  "target_type": "<target_type | null>",
  "target_id": "<target_id | null>"
}
```

Then it merges the caller-provided `data` object over those values. For sent notifications, the sender creates a `notification_logs` row first, then sends Expo Push with a copy of the same `payload_data`.

Important edge case: some non-sent daily reminder logs can be created directly in `daily_skin_log_reminder.py` when the user already has a skin log or when a send exception is handled. Those logs are not sent Expo payloads and may contain only the caller-level data. The user-facing log API currently returns only `status == "sent"` rows.

## analysis_ready

### Current Actual Payload

Created in `apps/backend/app/routers/my_skin_log.py` through `send_notification_event`.

```json
{
  "type": "analysis_ready",
  "screen": "report",
  "base_date": "YYYY-MM-DD",
  "target_type": "skin_log",
  "target_id": null,
  "notification_log_id": 123
}
```

Current required fields for sent payloads:

- `type`
- `screen`
- `base_date`
- `target_type`
- `target_id`
- `notification_log_id`

Current optional fields:

- None in the sent payload shape. `target_id` is present but can be `null`.

Mobile navigation uses:

- `screen`

Mobile navigation does not currently use:

- `base_date`
- `target_type`
- `target_id`
- `notification_log_id`

### Recommended Payload

```json
{
  "type": "analysis_ready",
  "screen": "report",
  "base_date": "YYYY-MM-DD",
  "target_type": "skin_log",
  "target_id": null,
  "notification_log_id": 123
}
```

Difference from current structure:

- No change recommended for the current fields.
- If future report navigation needs a specific date, `base_date` should be used instead of rebuilding from `dedupe_key`.

## analysis_complete

### Current Actual Payload

Created in `apps/backend/app/services/analysis_orchestrator.py` through `send_notification_event`.

```json
{
  "type": "analysis_complete",
  "screen": "report",
  "analysis_request_id": 123,
  "analysis_result_id": 456,
  "base_date": "YYYY-MM-DD",
  "target_type": "analysis_request",
  "target_id": 123,
  "notification_log_id": 123
}
```

Current required fields for sent payloads:

- `type`
- `screen`
- `analysis_request_id`
- `analysis_result_id`
- `base_date`
- `target_type`
- `target_id`
- `notification_log_id`

Current optional fields:

- None in the sent payload shape.

Mobile navigation uses:

- `screen`
- `analysis_request_id`
- `analysis_result_id`

Mobile navigation does not currently use:

- `base_date`
- `target_type`
- `target_id`
- `notification_log_id`

### Recommended Payload

```json
{
  "type": "analysis_complete",
  "screen": "report",
  "analysis_request_id": 123,
  "analysis_result_id": 456,
  "base_date": "YYYY-MM-DD",
  "target_type": "analysis_request",
  "target_id": 123,
  "notification_log_id": 123
}
```

Difference from current structure:

- No change recommended for the current fields.
- `analysis_request_id` and `analysis_result_id` should remain explicit payload fields because the mobile resolver already preserves them.

## analysis_failed

### Current Actual Payload

Created in `apps/backend/app/services/analysis_orchestrator.py` through `send_notification_event`.

```json
{
  "type": "analysis_failed",
  "screen": "report",
  "analysis_request_id": 123,
  "base_date": "YYYY-MM-DD",
  "target_type": "analysis_request",
  "target_id": 123,
  "notification_log_id": 123
}
```

Current required fields for sent payloads:

- `type`
- `screen`
- `analysis_request_id`
- `base_date`
- `target_type`
- `target_id`
- `notification_log_id`

Current optional fields:

- None in the sent payload shape.

Mobile navigation uses:

- `screen`
- `analysis_request_id`

Mobile navigation does not currently use:

- `base_date`
- `target_type`
- `target_id`
- `notification_log_id`

### Recommended Payload

```json
{
  "type": "analysis_failed",
  "screen": "report",
  "analysis_request_id": 123,
  "base_date": "YYYY-MM-DD",
  "target_type": "analysis_request",
  "target_id": 123,
  "notification_log_id": 123
}
```

Difference from current structure:

- No change recommended for the current fields.
- `analysis_result_id` should not be added unless a failed analysis can point to a real result row.

## daily_skin_log_reminder

### Current Actual Payload

Created in `apps/backend/app/services/daily_skin_log_reminder.py`.

Sent notifications go through `send_notification_event` and have:

```json
{
  "type": "daily_skin_log_reminder",
  "screen": "record",
  "target_date": "YYYY-MM-DD",
  "target_type": "skin_log",
  "target_id": null,
  "notification_log_id": 123
}
```

Direct non-sent logs created inside `daily_skin_log_reminder.py` may contain only:

```json
{
  "type": "daily_skin_log_reminder",
  "screen": "record",
  "target_date": "YYYY-MM-DD"
}
```

Current required fields for sent payloads:

- `type`
- `screen`
- `target_date`
- `target_type`
- `target_id`
- `notification_log_id`

Current optional fields:

- None in the sent payload shape. `target_id` is present but can be `null`.

Mobile navigation uses:

- `screen`
- `target_date`

Mobile navigation does not currently use:

- `target_type`
- `target_id`
- `notification_log_id`

### Recommended Payload

```json
{
  "type": "daily_skin_log_reminder",
  "screen": "record",
  "target_date": "YYYY-MM-DD",
  "target_type": "skin_log",
  "target_id": null,
  "notification_log_id": 123
}
```

Difference from current structure:

- No change recommended for sent notifications.
- If non-sent daily reminder logs are later exposed to users, align their `data` shape with the sent payload shape first.

## notification_log_id

`notification_log_id` is part of newly generated sender payloads. It is for push-click read handling only.

Shape:

```json
{
  "notification_log_id": 123
}
```

Policy:

- Use `data.notification_log_id` rather than a separate top-level Expo field so the source-of-truth rule stays simple.
- Do not make `notification_log_id` required for report or record navigation.
- Use it only as an optional helper for marking a pushed notification as read after a push click.
- If the field is absent or the mark-read API fails, navigation should still proceed.

Current feasibility:

- The sender currently creates the `notification_logs` row before building Expo payloads, so a log id exists before push send.
- `payload_data` is initially built before the row exists.
- After `_create_log` returns, the sender assigns a new data dict with `notification_log_id: log.id` back to `log.data`.
- Expo Push payloads are built from that same updated data object.

Implementation files:

- `apps/backend/app/services/notification_sender.py`
- `apps/backend/tests/test_notification_sender_data.py`
- `apps/mobile/src/nuvo/utils/pushNotifications.js`
- `apps/mobile/src/api/notifications.js`

Implementation policy:

1. Create the log using the existing sender flow.
2. Build an updated data object that adds `notification_log_id: log.id`.
3. Assign that updated object back to `log.data` rather than relying on in-place JSON mutation.
4. Send Expo Push with the same updated data object.
5. In the mobile push-click path, call mark-read with `notification_log_id` if present.
6. Keep report/record navigation independent from mark-read success.

## String Duplication and Constant Candidates

Current duplicated payload strings:

- Notification types: `analysis_ready`, `analysis_complete`, `analysis_failed`, `daily_skin_log_reminder`
- Screens: `report`, `record`
- Target types: `skin_log`, `analysis_request`

Current locations:

- Backend payload creation:
  - `apps/backend/app/routers/my_skin_log.py`
  - `apps/backend/app/services/analysis_orchestrator.py`
  - `apps/backend/app/services/daily_skin_log_reminder.py`
  - `apps/backend/app/services/notification_sender.py`
- Backend tests:
  - `apps/backend/tests/test_notification_sender_data.py`
  - `apps/backend/tests/test_notification_logs_api.py`
  - `apps/backend/tests/test_analysis_ready_notification.py`
  - `apps/backend/tests/test_daily_skin_log_reminder.py`
- Mobile resolver and display:
  - `apps/mobile/src/nuvo/utils/pushNotifications.js`
  - `apps/mobile/src/nuvo/screens/mypage/NotificationHistoryScreen.jsx`

Possible future constant locations:

- Backend: a small notification payload contract module near `app/services/notification_sender.py`, or a schema-oriented module under `app/schemas` if the contract becomes API-facing.
- Mobile: a small notification contract module near `src/nuvo/utils/pushNotifications.js` if more screens start sharing these values.

No constants were introduced as part of this documentation step. The current goal is to document the contract without changing runtime behavior.
