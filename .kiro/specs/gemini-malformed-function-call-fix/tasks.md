# Implementation Plan: Gemini Malformed Function Call Fix

## Overview

This implementation adds robust error detection and automatic model fallback to handle MALFORMED_FUNCTION_CALL errors from gemini-2.5-pro. The approach wraps the existing agent network execution with error detection logic that automatically retries with gemini-2.5-flash when appropriate, while preserving all existing functionality.

## Tasks

- [x] 1. Create error detection utility function
  - Create `src/features/conversations/inngest/utils/error-detection.ts`
  - Implement `isMalformedFunctionCallError` function that checks for malformed function call patterns
  - Export `ErrorDetectionResult` interface
  - Function should detect both explicit "MALFORMED_FUNCTION_CALL" text and malformed JSON patterns
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ]* 1.1 Write property test for error detection
  - **Property 1: Malformed Error Detection Accuracy**
  - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
  - Test that error detector correctly identifies malformed errors and extracts details
  - Test that non-malformed errors return false
  - Use fast-check to generate various error objects

- [x] 2. Create user feedback formatter utility
  - Create `src/features/conversations/inngest/utils/user-feedback.ts`
  - Implement `formatFallbackNotice` function that returns the fallback notice text
  - Keep the notice clear and non-technical
  - _Requirements: 4.1, 4.2_

- [x] 3. Add fallback logic to process-message workflow
  - [x] 3.1 Import error detection utility in `process-message.ts`
    - Add import for `isMalformedFunctionCallError`
    - Add import for `formatFallbackNotice`
    - _Requirements: 2.1_

  - [x] 3.2 Wrap network.run in enhanced error handling
    - Replace the existing try-catch around `network.run()` with enhanced version
    - Add `didFallback` boolean flag to track if fallback occurred
    - In catch block, call `isMalformedFunctionCallError` to detect malformed errors
    - Check if fallback should occur (malformed error + gemini-2.5-pro + google provider)
    - _Requirements: 1.1, 2.1_

  - [x] 3.3 Implement fallback attempt logging
    - Add `step.run("log-fallback-attempt")` when fallback is triggered
    - Log messageId, conversationId, originalModel, fallbackModel, and errorMessage
    - Create agent event with type "listFiles" and status "warning" for fallback attempt
    - Wrap agent event creation in try-catch to prevent propagation
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 3.4 Recreate agent network with fallback model
    - Extract the agent/network creation logic into a reusable pattern
    - Create new agent with gemini-2.5-flash model
    - Use same system prompt, tools, and parameters as original
    - Create new network with same configuration as original
    - _Requirements: 2.2, 2.3_

  - [x] 3.5 Execute fallback network and handle results
    - Call `fallbackNetwork.run(agentInput)` with same input
    - Set `didFallback = true` on success
    - Log successful fallback with `step.run("log-fallback-success")`
    - On fallback failure, log with `step.run("log-fallback-failure")` including both errors
    - Re-throw fallback error to be handled by existing error handling
    - _Requirements: 2.4, 2.5, 3.4, 3.5_

  - [x] 3.6 Prepend fallback notice to successful responses
    - After extracting assistant response, check `didFallback` flag
    - If true, prepend `formatFallbackNotice()` to the response
    - Ensure notice is separated from response with newlines
    - _Requirements: 4.1_

- [ ]* 3.7 Write property test for fallback context preservation
  - **Property 2: Fallback Preserves Request Context**
  - **Validates: Requirements 2.2, 2.3**
  - Test that fallback uses same input, system prompt, and tools

- [ ]* 3.8 Write property test for complete error logging
  - **Property 3: Complete Error Logging**
  - **Validates: Requirements 3.1, 3.2, 3.3**
  - Test that all malformed errors produce logs with required fields

- [ ]* 3.9 Write property test for fallback notice
  - **Property 4: Fallback Notice Prepended**
  - **Validates: Requirements 4.1**
  - Test that successful fallbacks have notice at start of response

- [ ] 4. Add unit tests for specific scenarios
  - [ ] 4.1 Create test file `src/features/conversations/inngest/__tests__/error-detection.test.ts`
    - Test error with explicit "MALFORMED_FUNCTION_CALL" text
    - Test error with malformed JSON pattern (`, "name":`)
    - Test normal error returns false
    - Test error detail extraction
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ]* 4.2 Create test file `src/features/conversations/inngest/__tests__/fallback-logic.test.ts`
    - Test fallback triggered for gemini-2.5-pro with malformed error
    - Test fallback not triggered for gemini-2.5-flash
    - Test fallback not triggered for OpenAI/Groq models
    - Test fallback not triggered for non-malformed errors
    - Test successful fallback prepends notice
    - Test failed fallback uses standard error handling
    - _Requirements: 2.1, 5.1, 5.2, 5.3, 4.1_

  - [ ]* 4.3 Create test file `src/features/conversations/inngest/__tests__/error-boundaries.test.ts`
    - Test that logging errors don't propagate
    - Test that message update errors are handled
    - Test that all error paths update message status
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ]* 4.4 Write property test for non-triggering conditions
  - **Property 5: Non-Triggering Conditions**
  - **Validates: Requirements 5.1, 5.2, 5.3**
  - Test that fallback is not activated when it shouldn't be

- [ ]* 4.5 Write property test for message updates on all error paths
  - **Property 6: All Error Paths Update Message**
  - **Validates: Requirements 6.4**
  - Test that every error scenario results in message update

- [ ] 5. Checkpoint - Ensure all tests pass
  - Run all unit tests and property tests
  - Verify no regressions in existing functionality
  - Ensure all tests pass, ask the user if questions arise

- [ ] 6. Add configuration support (optional enhancement)
  - Add environment variable `AUTODEV_GEMINI_FALLBACK_MODEL` with default "gemini-2.5-flash"
  - Update fallback logic to use configured model instead of hardcoded value
  - Update documentation to mention configuration option
  - _Requirements: 7.1_

- [x] 7. Final integration verification
  - Verify existing error handling (onFailure callback) still works
  - Verify existing agent event logging still works
  - Verify gemini-2.5-flash initial selection works without fallback
  - Verify OpenAI and Groq models work without fallback
  - _Requirements: 5.4, 5.5_

- [ ] 8. Final checkpoint - Ensure all tests pass
  - Run full test suite
  - Verify no console errors or warnings
  - Ensure all tests pass, ask the user if questions arise

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- The implementation preserves all existing functionality while adding robust error handling
- Property tests validate universal correctness properties across all inputs
- Unit tests validate specific examples and edge cases
- The fallback logic is non-invasive and only activates for specific error conditions
