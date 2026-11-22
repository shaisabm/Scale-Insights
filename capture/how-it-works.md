# How it works

Deep mode: what the site's JavaScript is made of and what its start page did while we watched.

## Its JavaScript

web_page_js_analyze didn't work: the page exposed no readable script sources over CDP

## Ten seconds of it

Watched http://127.0.0.1:9222/ for 10000ms: 0 request outline(s), 0 console entr(y/ies).

Evidence ev_cfbf854897e34fa9b1380ac17a1d50d9db814b3fe389053e64a3e40a7495a2d7.

```json
{
  "accessibility": null,
  "console": {
    "count": 0,
    "entries": [],
    "has_text": false
  },
  "dom": {
    "attribute_names": [],
    "elements_by_name": {
      "body": 1,
      "head": 1,
      "html": 1
    },
    "text_nodes": 0,
    "total_nodes": 4,
    "truncated": false
  },
  "dropped_events": 0,
  "frame_origins": [
    "http://127.0.0.1:9222"
  ],
  "network": {
    "request_count": 0,
    "requests": []
  },
  "origin": "http://127.0.0.1:9222/",
  "resources": [],
  "scripts": [],
  "scripts_truncated": false,
  "secret_redactions": 0,
  "storage_keys": null,
  "watch_ms": 10000,
  "websockets": {
    "connections": [],
    "frames": []
  }
}
```
