# Fallback Logic Configuration

## Trigger Conditions
Fallback mode activates when:
- Release notes input is empty
- API response fails
- Notes parsing fails

## Strategy

### Level 1: Partial Data
- Clean and rewrite usable text

### Level 2: No Data
Generate:
- App launch behavior
- Navigation checks
- Core features
- Audio (if applicable)
- Account sign-in

### Level 3: Minimal Output

App Name – TestFlight Build [number]

What to test:

- App launches correctly
- Navigation works
- Core features respond
- Audio works if applicable
- Account sign-in remains stable

## Rules
- Never output empty notes
- Never expose errors
