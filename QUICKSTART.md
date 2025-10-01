# Quick Start Guide

Get up and running with PyMCP's new specialized servers in 5 minutes!

## 🚀 Getting Started

### 1. Start the Dev Server

```bash
npm install  # or pnpm install
npm run dev
```

Open http://localhost:5173

### 2. Load a Model

1. **Model Selection**: The app auto-recommends a model
2. For **tool support**, select a Hermes model:
   - Hermes 3 Llama 3.1 8B (recommended)
3. **Click "Load Model"** (downloads ~4-5GB first time)
4. Wait for "Model loaded successfully"

### 3. Boot an MCP Server

1. **Select Server** from dropdown:
   - 👨‍🍳 **Chef Server** - for cooking demos
   - 🏋️ **Fitness Trainer** - for workout plans  
   - 💻 **Coding Mentor** - for code review
   - 📝 **Demo Server** - for basic MCP features

2. **Click "Boot MCP Server"**
3. Wait for "MCP server booted successfully!"
4. Check that tools appear in sidebar

### 4. Start Chatting!

Try these example queries:

#### With Chef Server 👨‍🍳
```
"I want to make a vegan pasta dish, what do you recommend?"
→ Uses semantic search to find vegan_pasta_primavera
→ Provides exact recipe with ingredients and instructions

"Convert 2 cups of flour to grams"
→ Calls convert_units tool
→ Returns conversion

"I'm allergic to eggs, what can I substitute?"
→ Calls substitute_ingredient tool
→ Suggests alternatives
```

#### With Fitness Server 🏋️
```
"I'm 70kg and 175cm tall, what's my BMI?"
→ Calls calculate_bmi tool
→ Provides BMI score and category

"Create a beginner strength training program for me"
→ Uses beginner_strength resource as context
→ Provides structured 8-week program

"How many calories should I eat?"
→ Asks for age, sex, activity level
→ Calls estimate_calories tool
```

#### With Coding Mentor 💻
```
"Review this Python code: [paste code]"
→ Uses code_review_checklist resource
→ Calls analyze_complexity and detect_code_smells
→ Provides structured feedback

"Explain async/await in JavaScript"
→ Uses javascript_async resource
→ Provides tutorial with examples

"What's the Factory pattern?"
→ Calls explain_pattern tool
→ Shows example code and use cases
```

---

## 🎯 Key Features to Try

### 1. Tool Calling
Ask the LLM to perform calculations, conversions, or lookups:
```
"Convert 350°F to Celsius"
"Calculate my one-rep max for 185lbs at 5 reps"
"Analyze the complexity of this code: [code]"
```

### 2. Resource Context (Automatic in Chef Server)
The Chef server automatically finds relevant recipes:
```
User: "Tell me about vegan pasta"
→ System finds vegan_pasta_primavera recipe
→ Includes full recipe as context
→ LLM uses actual recipe data in response
```

### 3. Multiple Tools in Sequence
LLMs can chain tool calls:
```
"I need to triple this recipe and convert to metric"
→ Calls scale_recipe(name, 3)
→ Calls convert_units multiple times
→ Returns complete scaled + converted recipe
```

### 4. Adjust Temperature
Use the temperature slider (Settings section):
- **0.0-0.3**: Very focused, deterministic
- **0.7**: Balanced (default)
- **1.0-2.0**: Creative, varied responses

---

## 📚 Understanding the Architecture

### MCP Protocol Features

Each server uses all 3 MCP features:

1. **Tools** (Function Calling)
   - LLM can execute functions
   - Example: `calculate_bmi(70, 175)`

2. **Resources** (Context Injection)
   - Read-only data for LLM context
   - Example: Recipe files, workout programs

3. **Prompts** (Workflow Templates)
   - Structured guidance for LLM
   - Example: `/meal-planner`, `/code-reviewer`

### How It Works

```
┌─────────────────────────────────────────────┐
│ 1. User Query: "Make vegan pasta"          │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 2. Semantic Search (Chef Server)           │
│    → Finds vegan_pasta_primavera recipe    │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 3. Load Resource                            │
│    → Fetches recipe JSON via MCP           │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 4. Build Context                            │
│    System Prompt:                           │
│    - [Selected prompt template]             │
│    - <resource>recipe JSON</resource>       │
│    - [Tool definitions]                     │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 5. LLM Response                             │
│    → Uses recipe data from context          │
│    → Calls tools if needed                  │
│    → Provides accurate, grounded answer     │
└─────────────────────────────────────────────┘
```

---

## 🔧 Troubleshooting

### Model won't load
- **Check WebGPU**: Some models need WebGPU support
- **Try CPU model**: Select a wllama model (works everywhere)
- **Clear cache**: Reload page, clear browser storage

### MCP server fails to boot
- **Check console**: F12 → Console for error messages
- **Pyodide loading**: First boot downloads Pyodide (~40MB)
- **Server file**: Ensure server file exists in `/public/`

### LLM doesn't use tools
- **Check model**: Only Hermes models support function calling
- **Load Hermes**: Switch to "Hermes 3 Llama 3.1 8B"
- **Clear chat**: Try a fresh conversation

### Tools called but fail
- **Check parameters**: Tool expects specific types
- **See console**: Errors logged to browser console
- **Test separately**: Try tool manually in Python

---

## 📖 Next Steps

### Learn More
- **[MCP_RESOURCES_AND_PROMPTS.md](./MCP_RESOURCES_AND_PROMPTS.md)** - Deep dive into Resources & Prompts
- **[MCP_SERVERS_GUIDE.md](./MCP_SERVERS_GUIDE.md)** - Complete server documentation
- **[IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md)** - Build your own server

### Customize
1. **Add recipes** to Chef server
2. **Create workout programs** for Fitness server
3. **Add tutorials** to Coding Mentor
4. **Build your own server** (see guides)

### Advanced Features
- **Semantic search** - Implement proper embeddings
- **Vector database** - Use sqlite-vec for scale
- **Prompt templates UI** - Slash commands
- **Resource selection** - Manual context control

---

## 🎓 Example Conversations

### Full Chef Demo
```
User: "I want to cook something healthy tonight"
AI: "I'd be happy to help! Are you interested in vegetarian/vegan options, 
    or would you prefer something with meat? Also, do you have any time 
    constraints?"

User: "Vegan and quick, under 30 minutes"
AI: *Uses search_recipes_semantic("vegan quick")*
    *Finds vegan_pasta_primavera (20 min cook time)*
    "Perfect! I found Vegan Pasta Primavera - it's colorful, healthy, 
    and takes only 35 minutes total (15 prep, 20 cook)."
    [Shows ingredients and instructions from actual recipe]

User: "Can I use olive oil instead of vegetable oil?"
AI: *Calls substitute_ingredient("vegetable oil", "unavailable")*
    "Yes! Olive oil is actually a great substitute for vegetable oil.
    Use the same amount. It'll add a nice flavor too!"

User: "I only have 2 people, not 4"
AI: *Calls scale_recipe("Vegan Pasta Primavera", 2)*
    "No problem! For 2 servings, multiply all ingredients by 0.5:
    - 6 oz pasta (instead of 12 oz)
    - 1 tbsp olive oil (instead of 2 tbsp)
    ..."
```

### Full Fitness Demo
```
User: "I'm new to fitness and want to build strength"
AI: "Great goal! Let me help you get started. First, let me ask a few questions:
    1. What's your current activity level?
    2. Do you have any equipment at home?
    3. How many days per week can you commit?"

User: "Sedentary, I have dumbbells, 3 days per week"
AI: *Uses find_workouts("build strength", "beginner")*
    *Loads beginner_strength resource*
    "Perfect! I recommend the Beginner Strength Training program:
    - 3 days per week (ideal for recovery)
    - Full-body workouts alternating Day A and Day B
    - Uses dumbbells you have"
    [Shows complete program with exercises, sets, reps]

User: "I'm 70kg, 175cm, 30 years old male. How many calories?"
AI: *Calls estimate_calories(70, 175, 30, "male", "sedentary")*
    "Based on your stats:
    - BMR: 1,640 calories
    - TDEE (sedentary): 1,968 calories/day
    - To build muscle: ~2,200 calories/day (+protein!)
    - Protein target: 140g per day (2g per kg bodyweight)"
```

---

## 🎉 You're Ready!

You now have:
- ✅ 4 specialized MCP servers
- ✅ Full MCP protocol support (Tools, Resources, Prompts)
- ✅ Semantic search example (Chef)
- ✅ Production-ready patterns
- ✅ 100% browser-based AI

**Start exploring and building!** 🚀

### Community
- Report issues on GitHub
- Share your custom servers
- Contribute improvements

### Resources
- [MCP Specification](https://modelcontextprotocol.io)
- [WebLLM Docs](https://webllm.mlc.ai)
- [Pyodide Docs](https://pyodide.org)

