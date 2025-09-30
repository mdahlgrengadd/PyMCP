"""
Chef MCP Server - Cooking Assistant with Semantic Recipe Search

Features:
- 🍳 TOOLS: Conversion, substitution, timers
- 📚 RESOURCES: Individual recipes with embeddings
- 🎯 PROMPTS: Cooking workflows (meal planning, dietary adaptation)
- 🔍 SEMANTIC SEARCH: Auto-select recipes based on conversation context
"""

from typing import Annotated, Literal, Optional
from pydantic import BaseModel, Field
from mcp_core import McpServer, attach_pyodide_worker
import json
import math

# ============================================================================
# Recipe Database (would be loaded from files in production)
# ============================================================================

RECIPES = {
    "vegan_pasta_primavera": {
        "name": "Vegan Pasta Primavera",
        "category": "Italian",
        "dietary": ["vegan", "vegetarian"],
        "prep_time": 15,
        "cook_time": 20,
        "servings": 4,
        "difficulty": "easy",
        "ingredients": [
            "12 oz pasta (penne or fusilli)",
            "2 tbsp olive oil",
            "3 cloves garlic, minced",
            "1 red bell pepper, sliced",
            "1 yellow bell pepper, sliced",
            "1 zucchini, sliced",
            "1 cup cherry tomatoes, halved",
            "1 cup broccoli florets",
            "1/4 cup vegetable broth",
            "2 tbsp nutritional yeast",
            "Fresh basil",
            "Salt and pepper to taste"
        ],
        "instructions": [
            "Cook pasta according to package directions",
            "Heat olive oil in large pan over medium-high heat",
            "Sauté garlic for 30 seconds until fragrant",
            "Add bell peppers and zucchini, cook 5 minutes",
            "Add broccoli and tomatoes, cook 3 minutes",
            "Add cooked pasta, broth, and nutritional yeast",
            "Toss everything together, season with salt and pepper",
            "Garnish with fresh basil and serve"
        ],
        "tags": ["vegan", "pasta", "vegetables", "Italian", "healthy", "quick"]
    },
    "chocolate_chip_cookies": {
        "name": "Classic Chocolate Chip Cookies",
        "category": "Dessert",
        "dietary": ["vegetarian"],
        "prep_time": 15,
        "cook_time": 12,
        "servings": 24,
        "difficulty": "easy",
        "ingredients": [
            "2 1/4 cups all-purpose flour",
            "1 tsp baking soda",
            "1 tsp salt",
            "1 cup (2 sticks) butter, softened",
            "3/4 cup granulated sugar",
            "3/4 cup packed brown sugar",
            "2 large eggs",
            "2 tsp vanilla extract",
            "2 cups chocolate chips"
        ],
        "instructions": [
            "Preheat oven to 375°F (190°C)",
            "Mix flour, baking soda, and salt in bowl",
            "Beat butter and both sugars until creamy",
            "Beat in eggs and vanilla",
            "Gradually blend in flour mixture",
            "Stir in chocolate chips",
            "Drop rounded tablespoons onto ungreased cookie sheets",
            "Bake 9-11 minutes until golden brown",
            "Cool on baking sheet for 2 minutes"
        ],
        "tags": ["dessert", "cookies", "chocolate", "baking", "sweet", "classic"]
    },
    "chicken_tikka_masala": {
        "name": "Chicken Tikka Masala",
        "category": "Indian",
        "dietary": ["gluten-free"],
        "prep_time": 30,
        "cook_time": 40,
        "servings": 6,
        "difficulty": "medium",
        "ingredients": [
            "2 lbs chicken breast, cubed",
            "1 cup plain yogurt",
            "2 tbsp tikka masala spice blend",
            "3 tbsp butter",
            "1 large onion, diced",
            "4 cloves garlic, minced",
            "1 tbsp ginger, grated",
            "1 can (14 oz) tomato sauce",
            "1 cup heavy cream",
            "1 tbsp garam masala",
            "Fresh cilantro",
            "Rice for serving"
        ],
        "instructions": [
            "Marinate chicken in yogurt and tikka spices for 30 minutes",
            "Grill or broil chicken until cooked through",
            "Melt butter in large pan, sauté onion until soft",
            "Add garlic and ginger, cook 1 minute",
            "Add tomato sauce and garam masala, simmer 10 minutes",
            "Stir in cream and cooked chicken",
            "Simmer 10-15 minutes until sauce thickens",
            "Garnish with cilantro, serve over rice"
        ],
        "tags": ["Indian", "chicken", "curry", "spicy", "comfort food", "gluten-free"]
    },
    "greek_salad": {
        "name": "Traditional Greek Salad",
        "category": "Salad",
        "dietary": ["vegetarian", "gluten-free"],
        "prep_time": 15,
        "cook_time": 0,
        "servings": 4,
        "difficulty": "easy",
        "ingredients": [
            "4 large tomatoes, cut into wedges",
            "1 cucumber, sliced",
            "1 red onion, thinly sliced",
            "1 green bell pepper, sliced",
            "1 cup Kalamata olives",
            "8 oz feta cheese, cubed",
            "1/4 cup olive oil",
            "2 tbsp red wine vinegar",
            "1 tsp dried oregano",
            "Salt and pepper to taste"
        ],
        "instructions": [
            "Combine tomatoes, cucumber, onion, and bell pepper in large bowl",
            "Add olives and feta cheese",
            "Whisk together olive oil, vinegar, and oregano",
            "Pour dressing over salad",
            "Toss gently and season with salt and pepper",
            "Let sit 10 minutes before serving"
        ],
        "tags": ["salad", "Greek", "Mediterranean", "healthy", "no-cook", "vegetarian"]
    },
    "thai_green_curry": {
        "name": "Thai Green Curry with Vegetables",
        "category": "Thai",
        "dietary": ["vegan", "gluten-free"],
        "prep_time": 20,
        "cook_time": 25,
        "servings": 4,
        "difficulty": "medium",
        "ingredients": [
            "2 tbsp coconut oil",
            "3 tbsp Thai green curry paste",
            "2 cans (14 oz each) coconut milk",
            "2 cups mixed vegetables (bamboo shoots, bell peppers, eggplant)",
            "1 cup Thai basil leaves",
            "2 tbsp soy sauce",
            "1 tbsp palm sugar or brown sugar",
            "1 lime, juiced",
            "Jasmine rice for serving"
        ],
        "instructions": [
            "Heat coconut oil in large pot over medium heat",
            "Fry curry paste for 2 minutes until fragrant",
            "Add coconut milk, stir to combine",
            "Bring to simmer, add vegetables",
            "Cook 15-20 minutes until vegetables are tender",
            "Stir in basil, soy sauce, sugar, and lime juice",
            "Serve hot over jasmine rice"
        ],
        "tags": ["Thai", "curry", "vegan", "spicy", "coconut", "Asian"]
    },
    "beef_tacos": {
        "name": "Authentic Beef Tacos",
        "category": "Mexican",
        "dietary": ["gluten-free"],
        "prep_time": 10,
        "cook_time": 15,
        "servings": 4,
        "difficulty": "easy",
        "ingredients": [
            "1 lb ground beef",
            "1 onion, diced",
            "2 cloves garlic, minced",
            "2 tsp cumin",
            "1 tsp paprika",
            "1 tsp chili powder",
            "Salt and pepper",
            "8 corn tortillas",
            "Toppings: lettuce, tomato, cheese, sour cream, salsa"
        ],
        "instructions": [
            "Cook ground beef in skillet over medium-high heat",
            "Add onion and garlic, cook until onion is soft",
            "Add spices, salt, and pepper",
            "Cook 5 more minutes, breaking up meat",
            "Warm tortillas in dry pan or microwave",
            "Fill tortillas with meat mixture",
            "Add your favorite toppings",
            "Serve immediately"
        ],
        "tags": ["Mexican", "tacos", "beef", "quick", "easy", "family-friendly"]
    }
}


# ============================================================================
# Simple Embedding & Vector Search (using cosine similarity)
# ============================================================================

def simple_tokenize(text: str) -> list[str]:
    """Simple tokenization for embedding"""
    return text.lower().split()


def compute_embedding(text: str) -> list[float]:
    """
    Simple embedding using word frequency (TF-IDF-like)
    In production, use actual embeddings from LLM
    """
    words = simple_tokenize(text)
    word_freq = {}
    for word in words:
        word_freq[word] = word_freq.get(word, 0) + 1

    # Create a simple 50-dimension embedding based on word hashes
    embedding = [0.0] * 50
    for word, freq in word_freq.items():
        idx = hash(word) % 50
        embedding[idx] += freq * 0.1

    # Normalize
    magnitude = math.sqrt(sum(x * x for x in embedding))
    if magnitude > 0:
        embedding = [x / magnitude for x in embedding]

    return embedding


def cosine_similarity(vec1: list[float], vec2: list[float]) -> float:
    """Compute cosine similarity between two vectors"""
    dot_product = sum(a * b for a, b in zip(vec1, vec2))
    return dot_product


def get_recipe_embedding(recipe_id: str) -> list[float]:
    """Get embedding for a recipe based on its content"""
    recipe = RECIPES[recipe_id]
    text = f"{recipe['name']} {recipe['category']} {' '.join(recipe['tags'])} {' '.join(recipe['ingredients'][:5])}"
    return compute_embedding(text)


# Precompute recipe embeddings
RECIPE_EMBEDDINGS = {
    recipe_id: get_recipe_embedding(recipe_id)
    for recipe_id in RECIPES.keys()
}


# ============================================================================
# Chef MCP Server
# ============================================================================

class ChefService(McpServer):

    # ===== TOOLS =====

    def convert_units(
        self,
        amount: float,
        from_unit: Literal["cup", "tbsp", "tsp", "oz", "lb", "ml", "l", "g", "kg"],
        to_unit: Literal["cup", "tbsp", "tsp",
                         "oz", "lb", "ml", "l", "g", "kg"]
    ) -> dict:
        """Convert cooking measurements between units"""

        # Conversion factors to ml/g base units
        volume_to_ml = {
            "cup": 240, "tbsp": 15, "tsp": 5,
            "ml": 1, "l": 1000, "oz": 30
        }
        weight_to_g = {
            "g": 1, "kg": 1000, "oz": 28.35, "lb": 453.59
        }

        try:
            if from_unit in volume_to_ml and to_unit in volume_to_ml:
                base = amount * volume_to_ml[from_unit]
                result = base / volume_to_ml[to_unit]
            elif from_unit in weight_to_g and to_unit in weight_to_g:
                base = amount * weight_to_g[from_unit]
                result = base / weight_to_g[to_unit]
            else:
                return {"error": "Cannot convert between volume and weight units"}

            return {
                "original": f"{amount} {from_unit}",
                "converted": f"{round(result, 2)} {to_unit}"
            }
        except Exception as e:
            return {"error": str(e)}

    def substitute_ingredient(self, ingredient: str, reason: str = "allergy") -> dict:
        """Find substitutes for ingredients based on dietary restrictions or availability"""

        substitutions = {
            "egg": {
                "vegan": ["1 tbsp flax + 3 tbsp water", "1/4 cup applesauce", "1/4 cup mashed banana"],
                "allergy": ["1 tbsp flax + 3 tbsp water", "egg replacer powder"],
                "unavailable": ["1/4 cup yogurt", "1/4 cup silken tofu"]
            },
            "butter": {
                "vegan": ["coconut oil", "vegan butter", "olive oil"],
                "health": ["applesauce (in baking)", "greek yogurt", "avocado"],
                "unavailable": ["margarine", "vegetable oil"]
            },
            "milk": {
                "vegan": ["almond milk", "oat milk", "soy milk", "coconut milk"],
                "lactose": ["lactose-free milk", "almond milk", "oat milk"],
                "unavailable": ["water + butter", "evaporated milk + water"]
            },
            "cream": {
                "vegan": ["coconut cream", "cashew cream", "oat cream"],
                "health": ["greek yogurt", "evaporated milk"],
                "unavailable": ["milk + butter"]
            },
            "flour": {
                "gluten-free": ["almond flour", "rice flour", "gluten-free blend"],
                "low-carb": ["almond flour", "coconut flour"],
                "unavailable": ["oat flour", "chickpea flour"]
            }
        }

        ingredient_lower = ingredient.lower()
        for key in substitutions:
            if key in ingredient_lower:
                options = substitutions[key].get(
                    reason, substitutions[key].get("unavailable", []))
                return {
                    "ingredient": ingredient,
                    "reason": reason,
                    "substitutes": options
                }

        return {
            "ingredient": ingredient,
            "message": f"No substitutions found for '{ingredient}'. Try searching online for '{ingredient} substitute'."
        }

    def scale_recipe(self, recipe_name: str, servings: int) -> dict:
        """Scale a recipe to a different number of servings"""

        # Find recipe by name
        recipe = None
        recipe_id = None
        for rid, r in RECIPES.items():
            if recipe_name.lower() in r['name'].lower():
                recipe = r
                recipe_id = rid
                break

        if not recipe:
            return {"error": f"Recipe '{recipe_name}' not found"}

        scale_factor = servings / recipe['servings']

        return {
            "recipe": recipe['name'],
            "original_servings": recipe['servings'],
            "new_servings": servings,
            "scale_factor": round(scale_factor, 2),
            "note": f"Multiply all ingredient amounts by {round(scale_factor, 2)}"
        }

    def find_recipes_by_dietary(
        self,
        dietary_restriction: Literal["vegan",
                                     "vegetarian", "gluten-free", "dairy-free"]
    ) -> list[str]:
        """Find recipes matching SPECIFIC dietary restrictions (vegan, vegetarian, gluten-free, dairy-free ONLY).

        Use this ONLY for dietary needs. For cuisine types (Thai, Italian, Mexican) or general 
        recipe search, use search_recipes_semantic instead.
        """

        matching = []
        for recipe_id, recipe in RECIPES.items():
            if dietary_restriction in recipe['dietary']:
                matching.append(recipe['name'])

        return matching

    def search_recipes_semantic(self, query: str, top_k: int = 3) -> list[dict]:
        """Search for recipes by ANY criteria: cuisine (Thai, Italian, Mexican), ingredients, 
        dish names, or cooking style. Returns detailed recipe information with resource URIs.

        Examples: "Thai food", "pasta dishes", "chicken recipes", "spicy Mexican", "easy desserts"
        """

        query_embedding = compute_embedding(query)

        # Compute similarities
        similarities = []
        for recipe_id, recipe_embedding in RECIPE_EMBEDDINGS.items():
            similarity = cosine_similarity(query_embedding, recipe_embedding)
            similarities.append((recipe_id, similarity))

        # Sort by similarity
        similarities.sort(key=lambda x: x[1], reverse=True)

        # Return top-k recipes
        results = []
        for recipe_id, score in similarities[:top_k]:
            recipe = RECIPES[recipe_id]
            results.append({
                "name": recipe['name'],
                "resource_uri": f"res://{recipe_id}",
                "category": recipe['category'],
                "difficulty": recipe['difficulty'],
                "relevance_score": round(score, 3)
            })

        return results

    # ===== RESOURCES (Individual Recipes) =====

    def resource_vegan_pasta_primavera(self) -> dict:
        """Vegan Pasta Primavera - Colorful Italian pasta with vegetables"""
        recipe = RECIPES["vegan_pasta_primavera"]
        return {
            "mimeType": "application/json",
            "text": json.dumps(recipe, indent=2)
        }

    def resource_chocolate_chip_cookies(self) -> dict:
        """Classic Chocolate Chip Cookies - Perfect sweet treat"""
        recipe = RECIPES["chocolate_chip_cookies"]
        return {
            "mimeType": "application/json",
            "text": json.dumps(recipe, indent=2)
        }

    def resource_chicken_tikka_masala(self) -> dict:
        """Chicken Tikka Masala - Creamy Indian curry"""
        recipe = RECIPES["chicken_tikka_masala"]
        return {
            "mimeType": "application/json",
            "text": json.dumps(recipe, indent=2)
        }

    def resource_greek_salad(self) -> dict:
        """Traditional Greek Salad - Fresh Mediterranean salad"""
        recipe = RECIPES["greek_salad"]
        return {
            "mimeType": "application/json",
            "text": json.dumps(recipe, indent=2)
        }

    def resource_thai_green_curry(self) -> dict:
        """Thai Green Curry - Spicy coconut curry with vegetables"""
        recipe = RECIPES["thai_green_curry"]
        return {
            "mimeType": "application/json",
            "text": json.dumps(recipe, indent=2)
        }

    def resource_beef_tacos(self) -> dict:
        """Authentic Beef Tacos - Quick and delicious Mexican tacos"""
        recipe = RECIPES["beef_tacos"]
        return {
            "mimeType": "application/json",
            "text": json.dumps(recipe, indent=2)
        }

    def resource_cooking_tips(self) -> str:
        """General cooking tips and techniques"""
        return """# Essential Cooking Tips

## Knife Skills
- Keep knives sharp - dull knives are dangerous
- Use proper cutting board (wood or plastic)
- Learn basic cuts: dice, mince, julienne, chiffonade

## Heat Control
- Preheat pans before adding food
- Don't overcrowd the pan
- Let meat rest after cooking

## Seasoning
- Season throughout cooking, not just at the end
- Taste as you go
- Salt brings out flavors

## Food Safety
- Wash hands before cooking
- Keep raw meat separate from other foods
- Use meat thermometer for doneness
- Store leftovers within 2 hours

## Common Mistakes to Avoid
- Not reading recipe fully before starting
- Using cold ingredients when recipe calls for room temp
- Opening oven door too frequently
- Not letting pan heat up enough
"""

    # ===== PROMPTS (Cooking Workflows) =====

    def prompt_meal_planner(self) -> dict:
        """Plan balanced meals for the week"""
        return {
            "description": "Weekly meal planning assistant",
            "messages": [{
                "role": "system",
                "content": """You are a meal planning expert. Help users plan nutritious, balanced meals.

When planning meals, consider:
1. **Nutritional Balance**: Include proteins, vegetables, whole grains
2. **Variety**: Different cuisines and flavors throughout the week
3. **Time Management**: Mix quick weekday meals with weekend cooking projects
4. **Budget**: Suggest cost-effective options and batch cooking
5. **Dietary Needs**: Accommodate restrictions and preferences

Use the search_recipes_semantic tool to find appropriate recipes.
Suggest meal prep tips and shopping lists."""
            }]
        }

    def prompt_cooking_instructor(self) -> dict:
        """Step-by-step cooking guidance"""
        return {
            "description": "Interactive cooking instructor",
            "messages": [{
                "role": "system",
                "content": """You are a patient cooking instructor guiding someone through a recipe.

Your approach:
1. **Preparation**: List all ingredients and tools needed first
2. **Step-by-Step**: Break complex steps into simple actions
3. **Timing**: Provide clear timing for each step
4. **Troubleshooting**: Anticipate common mistakes and offer fixes
5. **Encouragement**: Be supportive and explain the "why" behind techniques

Use convert_units for measurement questions.
Use substitute_ingredient when ingredients are unavailable.
Reference the recipe resources for accurate instructions."""
            }]
        }

    def prompt_dietary_adapter(self) -> dict:
        """Adapt recipes for dietary restrictions"""
        return {
            "description": "Recipe modification for dietary needs",
            "messages": [{
                "role": "system",
                "content": """You are a dietary adaptation specialist. Help modify recipes for:
- Vegan/Vegetarian diets
- Gluten-free requirements
- Allergy accommodations
- Low-carb/Keto
- Health conditions

Your process:
1. **Identify**: What ingredients need substitution?
2. **Substitute**: Use substitute_ingredient tool for alternatives
3. **Adjust**: Modify cooking times/methods if needed
4. **Nutrition**: Note any nutritional changes
5. **Taste**: Suggest seasoning adjustments

Be knowledgeable about food science and how substitutions affect texture/flavor."""
            }]
        }

    def prompt_recipe_critic(self) -> dict:
        """Provide constructive recipe feedback"""
        return {
            "description": "Recipe review and improvement suggestions",
            "messages": [{
                "role": "system",
                "content": """You are a culinary critic providing constructive feedback on recipes.

Evaluate:
1. **Flavor Balance**: Seasoning, acid, fat, sweetness
2. **Technique**: Proper cooking methods
3. **Presentation**: Visual appeal
4. **Practicality**: Time, difficulty, ingredient accessibility
5. **Nutrition**: Healthfulness and balance

Provide specific, actionable suggestions for improvement.
Be encouraging while being honest about weaknesses."""
            }]
        }


def boot():
    """Boot the Chef MCP server"""
    svc = ChefService()
    attach_pyodide_worker(svc)
