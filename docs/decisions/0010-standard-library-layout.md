# 0010 Standard library layout

**Status** Accepted

## Context

The library exposed multiple presentations and grouping preferences for the same saved items. The routes shared floating controls, which took space away from the collection and moved controls between desktop and mobile.

## Decision

Use a single grid of uniform cards ordered by saved date, newest first. One workspace rail owns navigation, and the library toolbar owns search, type and topic filters, appearance and capture. A Topics panel shows the full library’s topic counts and becomes a dialog below 1024px. The workspace rail becomes a bottom tab bar below 768px. The Reader retains its own navigation.

The grid uses the same item details, item actions, and page cursor for every card. Search still decides which items match through keyword and optional semantic retrieval. The library orders those matches by saved date.

## Consequences

The library has one layout to maintain and test. Its saved links can still carry supported filters or an item identifier. Users can reach archived items and favorites through the account menu and keep using the existing actions and details dialog.
