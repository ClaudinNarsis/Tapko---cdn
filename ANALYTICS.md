# Google Analytics 4 Integration

## Overview

The Tapko widget now includes comprehensive Google Analytics 4 (GA4) observability to track all user interactions across multiple domains. This allows you to monitor how the widget is being used, identify popular features, and measure engagement.

## Configuration

**Measurement ID:** `G-KBPCZXZR96`

The analytics integration is automatically initialized when the widget is loaded. No additional configuration is required.

## What's Being Tracked

### 1. Widget Lifecycle Events

- **`widget_initialized`** - Widget successfully initialized
  - Parameters: `widget_version`, `session_id`, `page_url`, `page_title`, `user_agent`, `screen_resolution`, `viewport_size`

- **`widget_ready`** - Widget ready for use
  - Parameters: `is_disabled`, `queue_enabled`, `project_data`

- **`widget_destroyed`** - Widget destroyed
  - Parameters: `session_duration`

### 2. Feedback Mode Events

- **`feedback_mode_entered`** - User entered feedback mode
  - Parameters: `entry_point`

- **`feedback_mode_exited`** - User exited feedback mode

### 3. Comment Lifecycle Events

- **`target_selected`** - User selected an element to comment on
  - Parameters: `target_tag`, `has_coordinates`

- **`comment_created`** - Comment card created
  - Parameters: `target_tag`

- **`comment_submitted`** - Comment successfully submitted
  - Parameters: `has_text`, `has_emoji`, `has_screenshot`, `has_drawing`, `has_recording`, `target_tag`, `comment_length`, `was_queued`

- **`comment_closed`** - Comment card closed
  - Parameters: `was_submitted`

### 4. Drawing Events

- **`drawing_started`** - User started drawing mode

- **`drawing_completed`** - User completed a drawing
  - Parameters: `has_data`

- **`drawing_undo`** - User undid last drawing action

- **`drawing_cleared`** - User cleared entire drawing

### 5. Recording Events

- **`recording_started`** - User started voice recording

- **`recording_stopped`** - User stopped voice recording
  - Parameters: `duration_ms`, `has_audio`

### 6. Error Events

- **`widget_error`** - An error occurred
  - Parameters: `error_type`, `error_message`, `fatal`

## Common Parameters

All events automatically include these parameters:

- `project_id` - The Tapko project ID
- `user_id` - The user ID provided during initialization
- `session_id` - Unique session identifier
- `widget_version` - Widget version (e.g., "1.0.0")
- `page_url` - Current page URL
- `timestamp` - ISO timestamp of the event

## Cross-Domain Tracking

The analytics implementation automatically supports cross-domain tracking. All events include the `project_id` which allows you to:

1. Track widget usage across multiple domains
2. Group analytics by project
3. Compare usage between different sites
4. Measure overall widget adoption

## Viewing Analytics Data

### Real-Time Reports

1. Go to Google Analytics 4 dashboard
2. Navigate to **Reports** → **Realtime**
3. Look for events with the prefix matching your widget events
4. View active users and their interactions in real-time

### Event Analysis

1. Go to **Reports** → **Engagement** → **Events**
2. See all custom events tracked by the widget
3. Click on any event to see detailed parameters
4. Export data for further analysis

### Custom Dimensions

The implementation sets up custom dimensions for:

- `dimension1`: `project_id`
- `dimension2`: `user_id`
- `dimension3`: `session_id`

These allow you to segment and filter your analytics data by project, user, or session.

## Testing Analytics

### Local Testing

1. Open `examples/analytics-test.html` in your browser
2. Interact with the widget
3. Watch the events log on the page
4. Check browser console for GA4 events

### Production Testing

1. Deploy the widget to your test domain
2. Open Google Analytics 4 Real-Time view
3. Interact with the widget
4. Verify events appear in real-time dashboard

### Console Logging

All analytics events are logged to the browser console with the prefix `[Tapko Analytics]`. You can monitor these logs to verify tracking is working correctly:

```javascript
// Example console output
[Tapko Analytics] Initialized with Measurement ID: G-KBPCZXZR96
[Tapko Analytics] Event tracked: widget_initialized { ... }
[Tapko Analytics] Event tracked: feedback_mode_entered { ... }
[GA4] Event sent: comment_submitted { ... }
```

## Key Metrics to Monitor

### Usage Metrics

- **Widget initialization rate** - How many times the widget loads successfully
- **Feedback mode entry rate** - How often users enter feedback mode
- **Comment creation rate** - How many comments are created vs submitted

### Feature Adoption

- **Drawing usage** - Percentage of comments that include drawings
- **Voice recording usage** - Percentage of comments with voice notes
- **Screenshot inclusion** - Percentage of comments with screenshots

### Engagement Metrics

- **Session duration** - Average time widget is active
- **Comments per session** - Average number of comments per user
- **Completion rate** - Comments created vs comments submitted

### Error Tracking

- **Error frequency** - Number of errors per session
- **Error types** - Most common error types
- **Fatal vs non-fatal** - Critical errors that block functionality

## Data Privacy

Since this is in testing phase with a handful of users, no privacy measures are currently implemented. Before moving to production with real users, consider:

1. **IP Anonymization** - Enable in GA4 settings
2. **Cookie Consent** - Respect user consent preferences
3. **PII Filtering** - Avoid tracking personally identifiable information
4. **Data Retention** - Configure appropriate data retention policies

## Architecture

### AnalyticsManager

Located at: `src/managers/AnalyticsManager.js`

The `AnalyticsManager` class handles:

- Loading the Google Analytics gtag.js script
- Initializing GA4 with your measurement ID
- Setting up event listeners for all widget events
- Enriching events with common parameters
- Queueing events if GA4 isn't loaded yet
- Managing session IDs and user tracking

### Integration Points

The analytics manager is initialized in the main widget class (`src/index.js`):

```javascript
// Initialize analytics
await analyticsManager.init(this.config.projectId, this.config.userId);
```

All widget events automatically trigger analytics tracking through event listeners. No manual tracking calls are needed in component code.

## Troubleshooting

### Events Not Appearing in GA4

1. **Check console for errors**
   - Open browser DevTools console
   - Look for `[Tapko Analytics]` messages
   - Verify gtag.js loaded successfully

2. **Verify Measurement ID**
   - Confirm `G-KBPCZXZR96` in `src/managers/AnalyticsManager.js`
   - Check GA4 property settings

3. **Check browser extensions**
   - Ad blockers may block GA4
   - Try in incognito mode
   - Disable privacy extensions temporarily

4. **Verify network requests**
   - Open Network tab in DevTools
   - Look for requests to `googletagmanager.com`
   - Check for any blocked requests

### Events Missing Parameters

1. Check that the event is dispatching with correct detail object
2. Verify the event listener in AnalyticsManager is capturing the data
3. Check console logs for the enriched parameters

### High Event Volume

If you notice too many events:

1. Review the event listeners in `AnalyticsManager.js`
2. Consider sampling for high-frequency events
3. Adjust tracking granularity as needed

## Future Enhancements

Potential improvements for production:

1. **Event Sampling** - Reduce data volume for high-traffic sites
2. **Custom Metrics** - Track widget performance metrics
3. **User Properties** - Set persistent user-level properties
4. **Conversion Tracking** - Track feedback as conversions
5. **Enhanced E-commerce** - If applicable to your use case
6. **BigQuery Export** - For advanced analysis and reporting

## Support

For questions or issues with the analytics integration:

1. Check console logs for detailed error messages
2. Review this documentation
3. Check Google Analytics 4 documentation
4. Contact the development team

---

**Implementation Date:** 2025-12-23
**GA4 Measurement ID:** G-KBPCZXZR96
**Widget Version:** 1.0.0
