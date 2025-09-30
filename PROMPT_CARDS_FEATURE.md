# Prompt Inspiration Cards Feature

## Overview

Beautiful, interactive cards that provide example prompts to inspire users and help them discover what each MCP server can do.

## What It Does

When an MCP server is loaded, the UI displays a grid of **prompt cards** showing example queries users can try. Click a card to automatically fill the chat input with that example.

## Visual Design

### Card Layout
```
┌─────────────────────────────────┐
│  🍝                          →  │  ← Hover indicator
│  Recipe Guidance                │
│  Get step-by-step instructions  │
│  for making delicious dishes    │
│                                  │
│  "Show me how to make           │
│   vegan pasta primavera"        │
└─────────────────────────────────┘
```

### Grid Display
- **Responsive**: 3-4 cards per row on desktop, 1 card on mobile
- **Scrollable**: Up to 300px height with overflow
- **Animated**: Hover effects with smooth transitions
- **Themed**: Matches the dark theme of the app

## Cards by Server

### Chef Server (👨‍🍳)
1. **🍝 Recipe Guidance** - "Show me how to make vegan pasta primavera"
2. **🥗 Dietary Adaptations** - "What vegan recipes do you have?"
3. **🔄 Ingredient Substitutes** - "What can I use instead of butter for vegan cooking?"
4. **📏 Recipe Scaling** - "Scale the vegan pasta recipe for 8 people"

### Fitness Server (🏋️)
1. **💪 Workout Programs** - "Create a strength training program for beginners"
2. **🎯 Exercise Library** - "Show me exercises for building chest muscles"
3. **📊 Progress Tracking** - "How should I track my strength gains?"
4. **🍎 Nutrition Guidance** - "Calculate my daily protein needs for muscle building"

### Coding Mentor (💻)
1. **💻 Code Tutorials** - "Teach me about async/await in JavaScript"
2. **🐛 Debug Help** - "Help me debug this Python function"
3. **🏗️ Architecture Advice** - "What's the best way to structure a React app?"
4. **📚 Code Review** - "Review my TypeScript code for improvements"

### Demo Server (📝)
1. **🔧 Basic Tools Demo** - "Calculate 15% tip on $85"
2. **⏰ Set Reminders** - "Set a timer for 25 minutes"
3. **📝 General Chat** - "Tell me about the weather today"

## User Flow

### 1. Initial State (No Server Loaded)
```
┌────────────────────────────────────┐
│ Welcome to WebLLM Chat Agent       │
│ 1. Select and load a model         │
│ 2. Boot the MCP server (for tools) │
│ 3. Start chatting!                 │
└────────────────────────────────────┘
```
**Prompt Cards**: Hidden

### 2. Server Booted, No Messages
```
┌────────────────────────────────────┐
│ 💡 Get Inspired                    │
│ Click a card to try it out         │
│                                    │
│ ┌──────┐ ┌──────┐ ┌──────┐        │
│ │ Card │ │ Card │ │ Card │ ...    │
│ └──────┘ └──────┘ └──────┘        │
└────────────────────────────────────┘
```
**Prompt Cards**: Visible ✅

### 3. User Clicks Card
```javascript
// Fills chat input automatically
chatInput.value = "Show me how to make vegan pasta primavera";
chatInput.focus();

// User can edit or press Enter to send
```

### 4. First Message Sent
```
┌────────────────────────────────────┐
│ User: Show me how to make...       │
│ Assistant: Here's the recipe...    │
└────────────────────────────────────┘
```
**Prompt Cards**: Hidden (conversation started)

### 5. Chat Cleared
```
┌────────────────────────────────────┐
│ Chat cleared                       │
│ Start a new conversation!          │
│                                    │
│ 💡 Get Inspired                    │
│ ┌──────┐ ┌──────┐ ┌──────┐        │
│ │ Card │ │ Card │ │ Card │ ...    │
│ └──────┘ └──────┘ └──────┘        │
└────────────────────────────────────┘
```
**Prompt Cards**: Visible again ✅

## Implementation Details

### TypeScript (main.ts)

```typescript
interface PromptCard {
  icon: string;        // Emoji icon
  title: string;       // Card title
  description: string; // What it does
  example: string;     // Example query
}

const PROMPT_CARDS_BY_SERVER: Record<string, PromptCard[]> = {
  'chef': [...],
  'fitness': [...],
  'coding': [...],
  'embedded': [...]
};

function renderPromptCards() {
  // Show/hide based on:
  // 1. Server has cards defined
  // 2. Conversation is empty
  
  if (cards.length === 0 || state.conversationHistory.length > 0) {
    promptCardsContainer.style.display = 'none';
    return;
  }
  
  // Render cards and attach click handlers
  promptCardsContainer.style.display = 'block';
  promptCards.innerHTML = cards.map(card => `
    <div class="prompt-card" data-example="${card.example}">
      ...
    </div>
  `).join('');
  
  // Click fills input
  card.addEventListener('click', () => {
    chatInput.value = card.dataset.example;
    chatInput.focus();
  });
}
```

### CSS (chat.css)

```css
.prompt-cards-container {
  background: var(--bg-secondary);
  padding: 1.5rem;
  max-height: 300px;
  overflow-y: auto;
}

.prompt-card {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.prompt-card:hover {
  border-color: var(--accent-primary);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
}

.prompt-card::after {
  content: '→';
  opacity: 0;
  transition: opacity 0.2s ease;
}

.prompt-card:hover::after {
  opacity: 1;
}
```

### HTML (index.html)

```html
<main class="chat-main">
  <!-- Prompt Cards (above chat) -->
  <div id="prompt-cards-container" class="prompt-cards-container" style="display: none;">
    <div class="prompt-cards-header">
      <h3>💡 Get Inspired</h3>
      <p>Click a card to try it out</p>
    </div>
    <div id="prompt-cards" class="prompt-cards">
      <!-- Cards inserted dynamically -->
    </div>
  </div>
  
  <!-- Chat Messages -->
  <div id="chat-messages" class="chat-messages">
    ...
  </div>
</main>
```

## When Cards Are Shown

✅ **Show when:**
- MCP server is booted
- Server has defined prompt cards
- Conversation history is empty
- User selects a different server

❌ **Hide when:**
- No MCP server loaded
- Conversation has started (messages exist)
- Server doesn't have cards defined

## Trigger Points

**renderPromptCards() is called:**
1. After MCP server boots successfully
2. When server selection changes
3. When first message is sent (to hide)
4. When chat is cleared (to show again)

## Customization

### Add Cards for New Server

```typescript
const PROMPT_CARDS_BY_SERVER: Record<string, PromptCard[]> = {
  // ... existing servers
  
  'my_new_server': [
    {
      icon: '🎨',
      title: 'Feature Name',
      description: 'What this feature does',
      example: 'Example query to try'
    },
    // ... more cards
  ]
};
```

### Adjust Card Styling

```css
/* Change card size */
.prompt-cards {
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); /* Wider cards */
}

/* Change colors */
.prompt-card:hover {
  border-color: #your-color;
  background: #your-bg;
}

/* Adjust max cards shown */
.prompt-cards-container {
  max-height: 400px; /* Show more cards */
}
```

## Benefits

### 1. ✅ Discoverability
Users immediately see what the server can do without reading documentation.

### 2. ✅ Onboarding
New users get started faster with ready-made examples.

### 3. ✅ Inspiration
Even experienced users discover features they didn't know about.

### 4. ✅ Reduced Friction
One click to try a feature instead of typing from scratch.

### 5. ✅ Visual Appeal
Makes the interface more engaging and professional.

### 6. ✅ Context-Aware
Different cards for different servers, always relevant.

## User Experience

### Before (No Cards)
```
User: "What can this do?"
User: *scrolls through documentation*
User: *types query manually*
User: *maybe makes a typo*
```

### After (With Cards)
```
User: *sees cards*
User: "Oh, I can do that!"
User: *clicks card*
User: *query auto-filled*
User: *press Enter*
✨ Instant success!
```

## Future Enhancements

### 1. Dynamic Cards from MCP Prompts
```typescript
// Instead of hardcoded, fetch from MCP server
const prompts = await mcpClient.call('prompts/list');
const cards = prompts.map(prompt => ({
  icon: prompt.icon || '💡',
  title: prompt.name,
  description: prompt.description,
  example: prompt.example || `Use ${prompt.name}`
}));
```

### 2. Card Categories
```typescript
{
  'Recipes': [card1, card2],
  'Substitutions': [card3, card4],
  'Nutrition': [card5, card6]
}
```

### 3. Search/Filter Cards
```html
<input 
  type="search" 
  placeholder="Search prompts..." 
  oninput="filterCards(this.value)"
/>
```

### 4. Favorite Cards
```typescript
// Save user's favorite prompts
localStorage.setItem('favoritePrompts', JSON.stringify([...]))
```

### 5. Recent Cards
```typescript
// Show recently used prompts
const recentPrompts = getRecentPrompts();
```

## Summary

**Prompt Inspiration Cards provide:**
- 🎨 Beautiful, professional UI
- 🚀 Faster user onboarding
- 💡 Feature discoverability
- 🎯 Context-aware examples
- ✨ Delightful user experience

**Try it out:**
1. Reload the page
2. Load a model
3. Boot the Chef server
4. See the beautiful prompt cards!
5. Click one to try it! 🎉

