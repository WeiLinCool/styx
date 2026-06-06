# Fix Doubao Image Request Format

## Problem
AI image generation with Doubao Seedream fails during run events with upstream `InvalidParameter`: image generation is only supported by certain models.

## Root Cause
The image provider adapter sends image requests to `/images/generations` but drifted from the approved design by omitting `response_format: "b64_json"`. Separately, if a configured model is spelled `doubao-seedrem` instead of the official `doubao-seedream-*` family, Volcengine Ark rejects it as not image-capable.

## Goal
Restore the documented request body shape and verify local model configuration so provider errors are not caused by adapter request drift.
