# VoiceOver Support Article Template

Use this template for in-app help, website support pages, and shared product documentation aimed at VoiceOver and screen-reader users.

This format is based on a task-first support article structure:
- plain title
- short explanation of why the article matters
- grouped sections by task
- direct keyboard and VoiceOver instructions
- concise support close

Keep the writing practical. Do not use marketing copy in these pages.

## Title

Using [Product Name] with VoiceOver

## Intro

Use one short paragraph:

- state that the app is intended to work well with VoiceOver
- explain what the guide helps the user do
- avoid filler

Example shape:

`[Product Name] is designed to be usable with VoiceOver. This guide covers the main tasks, navigation patterns, and keyboard commands you need to use the app efficiently.`

## Recommended Structure

### 1. Basics

Explain the main screen model in plain language.

Include:
- what the primary views are called
- how VoiceOver focus generally moves through them
- what the user should expect when the app opens

### 2. Getting Started

Explain the first successful task.

Include step bullets such as:
- open the app
- sign in or join as guest
- choose a server, room, or workspace
- confirm success cues

### 3. Main Navigation

Document how to move between the important app areas.

Include:
- tabs, sidebars, lists, toolbars, sheets, dialogs
- whether VoiceOver actions, rotor actions, or keyboard shortcuts are available
- what happens after activating each control

### 4. Working with Core Features

Split by task, not by implementation.

Examples:
- joining a room
- viewing people in a room
- sending a message
- changing audio settings
- previewing media
- managing server settings

### 5. Keyboard and VoiceOver Notes

List only the commands or patterns that matter.

Good examples:
- `VO-Space` activates the selected control
- arrow keys adjust sliders
- VoiceOver actions on a room or user row expose extra commands
- `Escape` closes sheets or dialogs where supported

### 6. Troubleshooting

Keep this short and concrete.

Examples:
- if no audio is heard, check output mute and selected device
- if no room users are shown, refresh the room and send diagnostics
- if a secure server fails, the app may retry using the fallback transport when allowed

### 7. Contact and Feedback

Close with one short paragraph explaining how to contact support or send diagnostics.

## Writing Rules

- Use short paragraphs.
- Use flat bullet lists only.
- One idea per bullet.
- Prefer exact control names from the UI.
- Prefer “choose”, “open”, “move to”, “activate”, “adjust”.
- Avoid internal architecture terms unless the user must know them.
- Do not explain implementation details.
- Do not use emoji in support articles.

## Accessibility Rules

- Headings must be hierarchical.
- Link text must be descriptive.
- Do not rely on color or icons alone to convey meaning.
- If a control has a visible label in the app, use that exact label in the doc.
- If a VoiceOver action is important, name it exactly and explain when it appears.

## Article Checklist

- The title is product-specific.
- The intro explains the purpose in one short paragraph.
- Tasks are grouped under clear headings.
- VoiceOver-specific actions are named directly.
- Troubleshooting is concrete and short.
- The page ends with support guidance.
