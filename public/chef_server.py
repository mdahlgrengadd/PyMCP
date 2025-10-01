"""
Chef MCP Server - Cooking Assistant with Semantic Recipe Search

Features:
- 🍳 TOOLS: Conversion, substitution, timers
- 📚 RESOURCES: Individual recipes with embeddings
- 🎯 PROMPTS: Cooking workflows (meal planning, dietary adaptation)
- 🔍 SEMANTIC SEARCH: Auto-select recipes based on conversation context
"""

from typing import Literal, Any, Dict, List
try:
    from mcp_core import McpServer, attach_pyodide_worker  # type: ignore
except ImportError:
    class McpServer:  # type: ignore
        pass

    def attach_pyodide_worker(_svc: object) -> None:  # type: ignore
        pass
import json

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
    "pad_thai": {
        "name": "Pad Thai with Shrimp",
        "category": "Thai",
        "dietary": ["gluten-free"],
        "prep_time": 15,
        "cook_time": 10,
        "servings": 4,
        "difficulty": "medium",
        "ingredients": [
            "8 oz rice noodles",
            "1 lb shrimp, peeled and deveined",
            "3 tbsp fish sauce",
            "2 tbsp tamarind paste",
            "2 tbsp palm sugar",
            "3 cloves garlic, minced",
            "2 eggs",
            "1 cup bean sprouts",
            "3 green onions, sliced",
            "1/4 cup roasted peanuts, crushed",
            "Lime wedges for serving"
        ],
        "instructions": [
            "Soak rice noodles in warm water for 30 minutes, drain",
            "Mix fish sauce, tamarind paste, and palm sugar in a bowl",
            "Heat oil in wok over high heat, stir-fry garlic",
            "Add shrimp, cook until pink (2-3 minutes)",
            "Push shrimp to side, crack eggs into wok and scramble",
            "Add drained noodles and sauce, toss to combine",
            "Add bean sprouts and green onions, stir-fry 2 minutes",
            "Serve garnished with peanuts and lime wedges"
        ],
        "tags": ["Thai", "noodles", "shrimp", "stir-fry", "quick", "Asian"]
    },
    "thai_basil_chicken": {
        "name": "Thai Basil Chicken (Pad Krapow Gai)",
        "category": "Thai",
        "dietary": ["gluten-free"],
        "prep_time": 10,
        "cook_time": 10,
        "servings": 4,
        "difficulty": "easy",
        "ingredients": [
            "1.5 lbs ground chicken",
            "3 tbsp vegetable oil",
            "6 cloves garlic, minced",
            "2 Thai chilies, sliced",
            "2 tbsp oyster sauce",
            "2 tbsp soy sauce",
            "1 tbsp fish sauce",
            "1 tsp sugar",
            "1 cup Thai basil leaves",
            "4 fried eggs (for topping)",
            "Steamed jasmine rice for serving"
        ],
        "instructions": [
            "Heat oil in wok over high heat",
            "Add garlic and chilies, stir-fry 30 seconds",
            "Add ground chicken, break up and cook until browned",
            "Add oyster sauce, soy sauce, fish sauce, and sugar",
            "Stir-fry 2-3 minutes until chicken is cooked through",
            "Turn off heat, stir in Thai basil until wilted",
            "Serve over rice topped with fried egg"
        ],
        "tags": ["Thai", "chicken", "spicy", "quick", "easy", "basil", "Asian"]
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
    },

    # Italian Recipes
    "spaghetti_carbonara": {
        "name": "Classic Spaghetti Carbonara",
        "category": "Italian",
        "dietary": ["vegetarian"],
        "prep_time": 10,
        "cook_time": 15,
        "servings": 4,
        "difficulty": "medium",
        "ingredients": [
            "1 lb spaghetti",
            "6 large eggs",
            "1 cup grated Pecorino Romano cheese",
            "8 oz pancetta, diced",
            "4 cloves garlic, minced",
            "1/2 cup pasta water",
            "Black pepper, freshly ground",
            "Salt to taste"
        ],
        "instructions": [
            "Cook spaghetti according to package directions, reserving 1 cup pasta water",
            "In a bowl, whisk eggs with grated cheese and black pepper",
            "Cook pancetta in large skillet until crispy, add garlic",
            "Add hot pasta to skillet with pancetta",
            "Remove from heat, quickly stir in egg mixture",
            "Add pasta water gradually while stirring to create creamy sauce",
            "Serve immediately with extra cheese and black pepper"
        ],
        "tags": ["Italian", "pasta", "carbonara", "quick", "comfort-food"]
    },
    "risotto_milanese": {
        "name": "Risotto alla Milanese",
        "category": "Italian",
        "dietary": ["vegetarian", "gluten-free"],
        "prep_time": 15,
        "cook_time": 25,
        "servings": 4,
        "difficulty": "medium",
        "ingredients": [
            "1.5 cups Arborio rice",
            "4 cups warm chicken or vegetable broth",
            "1/2 cup dry white wine",
            "1 large onion, finely diced",
            "1/2 tsp saffron threads",
            "1/2 cup grated Parmesan cheese",
            "3 tbsp butter",
            "2 tbsp olive oil",
            "Salt and white pepper to taste"
        ],
        "instructions": [
            "Soak saffron in 2 tbsp warm broth for 10 minutes",
            "Sauté onion in butter and oil until translucent",
            "Add rice, stir for 2 minutes until edges are translucent",
            "Add wine, stir until absorbed",
            "Add broth 1/2 cup at a time, stirring constantly",
            "After 15 minutes, add saffron mixture",
            "Continue adding broth until rice is creamy and al dente",
            "Stir in Parmesan cheese, season with salt and pepper"
        ],
        "tags": ["Italian", "risotto", "saffron", "Milanese", "elegant"]
    },
    "caprese_salad": {
        "name": "Caprese Salad",
        "category": "Italian",
        "dietary": ["vegetarian", "gluten-free", "dairy-free"],
        "prep_time": 10,
        "cook_time": 0,
        "servings": 4,
        "difficulty": "easy",
        "ingredients": [
            "4 large ripe tomatoes, sliced",
            "1 lb fresh mozzarella, sliced",
            "1/2 cup fresh basil leaves",
            "1/4 cup extra virgin olive oil",
            "2 tbsp balsamic vinegar",
            "Salt and black pepper to taste"
        ],
        "instructions": [
            "Arrange tomato and mozzarella slices alternately on serving platter",
            "Tuck fresh basil leaves between slices",
            "Drizzle with olive oil and balsamic vinegar",
            "Season with salt and freshly ground black pepper",
            "Serve immediately at room temperature"
        ],
        "tags": ["Italian", "salad", "fresh", "no-cook", "summer"]
    },

    # French Recipes
    "coq_au_vin": {
        "name": "Coq au Vin",
        "category": "French",
        "dietary": ["gluten-free"],
        "prep_time": 30,
        "cook_time": 90,
        "servings": 6,
        "difficulty": "hard",
        "ingredients": [
            "3 lbs chicken pieces (thighs and drumsticks)",
            "1 bottle dry red wine",
            "8 oz bacon, diced",
            "1 lb pearl onions, peeled",
            "1 lb mushrooms, quartered",
            "4 cloves garlic, minced",
            "2 tbsp tomato paste",
            "2 cups chicken broth",
            "Fresh thyme and bay leaves",
            "Salt and pepper to taste"
        ],
        "instructions": [
            "Marinate chicken in wine with herbs for 2 hours",
            "Cook bacon until crispy, remove and set aside",
            "Brown chicken pieces in bacon fat",
            "Add onions and mushrooms, cook until golden",
            "Add garlic, tomato paste, and marinating liquid",
            "Simmer covered for 1 hour until chicken is tender",
            "Return bacon to pot, season and serve"
        ],
        "tags": ["French", "wine", "braised", "classic", "elegant"]
    },
    "ratatouille": {
        "name": "Ratatouille",
        "category": "French",
        "dietary": ["vegan", "vegetarian", "gluten-free"],
        "prep_time": 20,
        "cook_time": 45,
        "servings": 6,
        "difficulty": "medium",
        "ingredients": [
            "2 eggplants, diced",
            "2 zucchini, diced",
            "2 yellow squash, diced",
            "2 bell peppers, diced",
            "1 large onion, diced",
            "4 tomatoes, diced",
            "6 cloves garlic, minced",
            "1/4 cup olive oil",
            "Fresh basil and thyme",
            "Salt and pepper to taste"
        ],
        "instructions": [
            "Salt eggplant and let drain for 30 minutes",
            "Sauté onions and garlic until soft",
            "Add peppers, cook for 5 minutes",
            "Add eggplant, zucchini, and squash",
            "Cook covered for 20 minutes",
            "Add tomatoes and herbs",
            "Simmer uncovered for 15 minutes",
            "Season and serve warm or cold"
        ],
        "tags": ["French", "vegetables", "Provençal", "healthy", "colorful"]
    },
    "quiche_lorraine": {
        "name": "Quiche Lorraine",
        "category": "French",
        "dietary": ["vegetarian"],
        "prep_time": 25,
        "cook_time": 45,
        "servings": 8,
        "difficulty": "medium",
        "ingredients": [
            "1 pie crust (9-inch)",
            "8 oz bacon, diced",
            "1 cup heavy cream",
            "4 large eggs",
            "1 cup grated Gruyère cheese",
            "1/2 tsp nutmeg",
            "Salt and white pepper to taste"
        ],
        "instructions": [
            "Preheat oven to 375°F",
            "Blind bake pie crust for 10 minutes",
            "Cook bacon until crispy, drain",
            "Whisk eggs with cream, nutmeg, salt, and pepper",
            "Sprinkle bacon and cheese in crust",
            "Pour egg mixture over filling",
            "Bake 35-40 minutes until set",
            "Cool 10 minutes before serving"
        ],
        "tags": ["French", "quiche", "bacon", "brunch", "classic"]
    },

    # British Recipes
    "fish_and_chips": {
        "name": "Fish and Chips",
        "category": "British",
        "dietary": ["dairy-free"],
        "prep_time": 30,
        "cook_time": 20,
        "servings": 4,
        "difficulty": "medium",
        "ingredients": [
            "4 cod fillets (6 oz each)",
            "4 large potatoes, cut into chips",
            "1 cup all-purpose flour",
            "1 cup beer",
            "1 tsp baking powder",
            "Salt and vinegar",
            "Oil for deep frying"
        ],
        "instructions": [
            "Cut potatoes into thick chips, soak in cold water",
            "Make batter with flour, beer, and baking powder",
            "Heat oil to 350°F",
            "Fry chips until golden, drain and salt",
            "Dip fish in batter, fry until golden",
            "Serve with malt vinegar and mushy peas"
        ],
        "tags": ["British", "fried", "fish", "chips", "pub-food"]
    },
    "beef_wellington": {
        "name": "Beef Wellington",
        "category": "British",
        "dietary": ["gluten-free"],
        "prep_time": 60,
        "cook_time": 45,
        "servings": 8,
        "difficulty": "hard",
        "ingredients": [
            "3 lb beef tenderloin",
            "1 lb puff pastry",
            "8 oz mushrooms, finely chopped",
            "4 oz pâté",
            "8 slices prosciutto",
            "2 egg yolks",
            "Dijon mustard",
            "Salt and pepper to taste"
        ],
        "instructions": [
            "Sear beef tenderloin on all sides",
            "Brush with mustard, let cool",
            "Sauté mushrooms until dry",
            "Wrap beef in prosciutto and mushroom mixture",
            "Wrap in puff pastry, seal edges",
            "Brush with egg wash",
            "Bake at 400°F for 25-30 minutes",
            "Rest 10 minutes before slicing"
        ],
        "tags": ["British", "beef", "elegant", "special-occasion", "Gordon-Ramsay"]
    },
    "shepherds_pie": {
        "name": "Shepherd's Pie",
        "category": "British",
        "dietary": ["vegetarian"],
        "prep_time": 30,
        "cook_time": 45,
        "servings": 6,
        "difficulty": "easy",
        "ingredients": [
            "2 lbs ground lamb",
            "1 large onion, diced",
            "2 carrots, diced",
            "2 lbs potatoes, mashed",
            "1 cup frozen peas",
            "2 tbsp Worcestershire sauce",
            "1 cup beef broth",
            "Butter and milk for mash",
            "Salt and pepper to taste"
        ],
        "instructions": [
            "Brown lamb with onions and carrots",
            "Add Worcestershire sauce and broth",
            "Simmer until vegetables are tender",
            "Add peas, season to taste",
            "Top with mashed potatoes",
            "Dot with butter",
            "Bake at 400°F for 25 minutes",
            "Broil until golden brown"
        ],
        "tags": ["British", "comfort-food", "lamb", "mashed-potatoes", "hearty"]
    },

    # Swedish Recipes
    "gravlax": {
        "name": "Gravlax (Cured Salmon)",
        "category": "Swedish",
        "dietary": ["gluten-free", "dairy-free"],
        "prep_time": 20,
        "cook_time": 0,
        "servings": 8,
        "difficulty": "easy",
        "ingredients": [
            "2 lbs fresh salmon fillet",
            "1/2 cup salt",
            "1/2 cup sugar",
            "2 tbsp white pepper",
            "1 large bunch fresh dill",
            "Mustard sauce for serving"
        ],
        "instructions": [
            "Mix salt, sugar, and pepper",
            "Place salmon skin-side down",
            "Cover with dill and salt mixture",
            "Wrap tightly in plastic wrap",
            "Refrigerate for 48-72 hours",
            "Turn every 12 hours",
            "Slice thinly and serve with mustard sauce"
        ],
        "tags": ["Swedish", "salmon", "cured", "Scandinavian", "appetizer"]
    },
    "meatballs_swedish": {
        "name": "Swedish Meatballs",
        "category": "Swedish",
        "dietary": ["vegetarian"],
        "prep_time": 25,
        "cook_time": 30,
        "servings": 6,
        "difficulty": "medium",
        "ingredients": [
            "1 lb ground beef",
            "1 lb ground pork",
            "1/2 cup breadcrumbs",
            "1/2 cup milk",
            "1 egg",
            "1 onion, finely grated",
            "Allspice and nutmeg",
            "Salt and pepper to taste",
            "Cream sauce for serving"
        ],
        "instructions": [
            "Soak breadcrumbs in milk",
            "Mix meats with soaked breadcrumbs",
            "Add egg, onion, and spices",
            "Form into small meatballs",
            "Brown in butter until cooked through",
            "Make cream sauce in same pan",
            "Return meatballs to sauce",
            "Serve with lingonberry jam"
        ],
        "tags": ["Swedish", "meatballs", "comfort-food", "IKEA", "classic"]
    },
    "smorgasbord_salad": {
        "name": "Smörgåsbord Salad",
        "category": "Swedish",
        "dietary": ["vegan", "vegetarian", "gluten-free"],
        "prep_time": 15,
        "cook_time": 0,
        "servings": 6,
        "difficulty": "easy",
        "ingredients": [
            "1 lb mixed greens",
            "1 cucumber, sliced",
            "1 cup cherry tomatoes",
            "1/2 red onion, thinly sliced",
            "1/2 cup pickled herring (optional)",
            "1/4 cup dill",
            "Swedish vinaigrette",
            "Salt and pepper to taste"
        ],
        "instructions": [
            "Wash and dry mixed greens",
            "Arrange greens on large platter",
            "Top with cucumber and tomatoes",
            "Add red onion slices",
            "Garnish with dill",
            "Drizzle with Swedish vinaigrette",
            "Add pickled herring if desired",
            "Serve immediately"
        ],
        "tags": ["Swedish", "salad", "fresh", "Scandinavian", "healthy"]
    }
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
        except (ValueError, ZeroDivisionError, KeyError) as e:
            return {"error": f"Conversion error: {str(e)}"}

    def substitute_ingredient(self, ingredient: str, reason: str = "general") -> dict:
        """Find substitutes for ingredients based on dietary restrictions or availability"""

        substitutions = {
            # Vegetables
            "zucchini": {
                "general": ["yellow squash", "eggplant", "pattypan squash", "cucumber (raw dishes)"],
                "unavailable": ["yellow squash", "summer squash", "eggplant"],
                "vegan": ["yellow squash", "eggplant"],
                "ratio": "1:1",
                "notes": "Yellow squash is the closest match in texture and moisture content."
            },
            "eggplant": {
                "general": ["zucchini", "portobello mushrooms", "firm tofu"],
                "unavailable": ["zucchini", "large mushrooms"],
                "vegan": ["zucchini", "portobello mushrooms"],
                "ratio": "1:1",
                "notes": "For similar texture, salt and drain eggplant before cooking."
            },
            "bell pepper": {
                "general": ["poblano pepper", "anaheim pepper", "zucchini"],
                "unavailable": ["poblano pepper", "banana pepper"],
                "vegan": ["any pepper variety", "zucchini"],
                "ratio": "1:1",
                "notes": "Use poblano for more flavor, zucchini for similar texture."
            },
            "broccoli": {
                "general": ["cauliflower", "broccolini", "green beans"],
                "unavailable": ["cauliflower", "brussels sprouts"],
                "vegan": ["cauliflower", "asparagus"],
                "ratio": "1:1",
                "notes": "Cauliflower has similar texture but milder flavor."
            },
            "tomato": {
                "general": ["canned tomatoes", "tomato paste + water", "red bell pepper"],
                "unavailable": ["canned tomatoes", "sun-dried tomatoes"],
                "vegan": ["canned tomatoes", "red bell pepper"],
                "ratio": "1:1 for fresh, 1 cup fresh = 1/2 cup paste + water",
                "notes": "Canned tomatoes often have better flavor than off-season fresh."
            },
            # Dairy
            "egg": {
                "vegan": ["1 tbsp flax + 3 tbsp water", "1/4 cup applesauce", "1/4 cup mashed banana"],
                "allergy": ["1 tbsp flax + 3 tbsp water", "egg replacer powder"],
                "unavailable": ["1/4 cup yogurt", "1/4 cup silken tofu"],
                "ratio": "per egg",
                "notes": "Flax egg works best for structure, applesauce for moisture."
            },
            "butter": {
                "vegan": ["coconut oil", "vegan butter", "olive oil"],
                "health": ["applesauce (in baking)", "greek yogurt", "avocado"],
                "unavailable": ["margarine", "vegetable oil"],
                "ratio": "1:1 for oils, reduce liquid slightly for applesauce",
                "notes": "Olive oil adds flavor, coconut oil is neutral when refined."
            },
            "milk": {
                "vegan": ["almond milk", "oat milk", "soy milk", "coconut milk"],
                "lactose": ["lactose-free milk", "almond milk", "oat milk"],
                "unavailable": ["water + butter", "evaporated milk + water"],
                "ratio": "1:1",
                "notes": "Oat milk is creamiest for cooking."
            },
            "cream": {
                "vegan": ["coconut cream", "cashew cream", "oat cream"],
                "health": ["greek yogurt", "evaporated milk"],
                "unavailable": ["milk + butter", "half-and-half"],
                "ratio": "1:1",
                "notes": "Coconut cream adds slight coconut flavor."
            },
            "parmesan": {
                "vegan": ["nutritional yeast", "vegan parmesan", "cashew parmesan"],
                "unavailable": ["romano cheese", "asiago cheese"],
                "lactose": ["lactose-free parmesan", "nutritional yeast"],
                "ratio": "1:2 for nutritional yeast (use less)",
                "notes": "Nutritional yeast adds umami flavor."
            },
            "cheese": {
                "vegan": ["cashew cheese", "vegan cheese", "nutritional yeast"],
                "lactose": ["lactose-free cheese", "nutritional yeast"],
                "unavailable": ["tofu", "cashew cream"],
                "ratio": "1:1 for vegan cheese",
                "notes": "Cashew-based cheeses melt better than others."
            },
            # Proteins
            "chicken": {
                "vegan": ["tofu", "tempeh", "seitan", "chickpeas", "cauliflower"],
                "unavailable": ["turkey", "pork"],
                "vegetarian": ["tofu", "tempeh", "seitan"],
                "ratio": "1:1",
                "notes": "Firm tofu or seitan work best for texture."
            },
            "beef": {
                "vegan": ["seitan", "portobello mushrooms", "lentils", "tempeh"],
                "unavailable": ["lamb", "pork"],
                "vegetarian": ["portobello mushrooms", "lentils"],
                "ratio": "1:1",
                "notes": "Seitan has the meatiest texture."
            },
            # Oils & Fats
            "olive oil": {
                "general": ["avocado oil", "grapeseed oil", "vegetable oil"],
                "unavailable": ["canola oil", "vegetable oil"],
                "vegan": ["any vegetable oil"],
                "ratio": "1:1",
                "notes": "Avocado oil has highest smoke point."
            },
            "coconut oil": {
                "general": ["butter", "vegetable oil", "grapeseed oil"],
                "vegan": ["vegetable oil", "avocado oil"],
                "unavailable": ["butter", "margarine"],
                "ratio": "1:1",
                "notes": "Refined coconut oil has no coconut flavor."
            },
            # Baking
            "flour": {
                "gluten-free": ["almond flour", "rice flour", "gluten-free blend"],
                "low-carb": ["almond flour", "coconut flour"],
                "unavailable": ["oat flour", "chickpea flour"],
                "ratio": "1:1 for blends, adjust for almond/coconut flour",
                "notes": "Use established gluten-free blends for best results."
            },
            "sugar": {
                "health": ["honey", "maple syrup", "stevia"],
                "vegan": ["maple syrup", "agave nectar", "date sugar"],
                "unavailable": ["honey", "maple syrup"],
                "ratio": "1:1 for most, reduce liquid for syrups",
                "notes": "Liquid sweeteners add moisture to baked goods."
            }
        }

        ingredient_lower = ingredient.lower().strip()

        # Try exact match first
        if ingredient_lower in substitutions:
            sub_data = substitutions[ingredient_lower]
            options = sub_data.get(reason, sub_data.get("general", []))
            return {
                "ingredient": ingredient,
                "found": True,
                "reason": reason,
                "substitutes": options,
                "ratio": sub_data.get("ratio", "1:1"),
                "notes": sub_data.get("notes", "")
            }

        # Try partial matching (e.g., "red bell pepper" → "bell pepper")
        for key, sub_data in substitutions.items():
            if key in ingredient_lower or ingredient_lower in key:
                options = sub_data.get(reason, sub_data.get("general", []))
                return {
                    "ingredient": ingredient,
                    "found": True,
                    "matched_as": key,
                    "reason": reason,
                    "substitutes": options,
                    "ratio": sub_data.get("ratio", "1:1"),
                    "notes": sub_data.get("notes", "")
                }

        return {
            "ingredient": ingredient,
            "found": False,
            "message": f"No substitutions found for '{ingredient}'. This might be a specialized ingredient. Consider searching online or asking a chef.",
            "suggestion": "Try describing the ingredient's role in the recipe (e.g., 'binding agent', 'adds moisture', 'provides protein') for better suggestions."
        }

    def scale_recipe(self, recipe_name: str, servings: int) -> dict:
        """Scale a recipe to a different number of servings"""

        # Find recipe by name
        recipe: Dict[str, Any] | None = None
        for _, r in RECIPES.items():
            name = str(r.get('name', ''))
            if recipe_name.lower() in name.lower():
                recipe = r
                break

        if not recipe:
            return {"error": f"Recipe '{recipe_name}' not found"}

        original_servings = int(recipe.get('servings', 1))
        scale_factor = float(servings) / float(original_servings)

        return {
            "recipe": recipe['name'],
            "original_servings": original_servings,
            "new_servings": servings,
            "scale_factor": round(scale_factor, 2),
            "note": f"Multiply all ingredient amounts by {round(scale_factor, 2)}"
        }

    def search_recipes(self, query: str, max_results: int = 5) -> List[Dict[str, Any]]:
        """Search for recipes by cuisine, ingredients, dish name, or cooking style.

        Searches across recipe names, categories, tags, and ingredients using keyword matching.
        Returns detailed recipe information with resource URIs.

        Examples: "Thai", "pasta", "chicken", "Mexican tacos", "easy desserts", "spicy"
        """
        query_lower: str = query.lower()
        query_words: set[str] = set(query_lower.split())

        results: List[Dict[str, Any]] = []
        for recipe_id, recipe in RECIPES.items():
            score: int = 0

            # Check name (highest weight)
            name: str = str(recipe.get('name', ''))
            if query_lower in name.lower():
                score += 10

            # Check category (high weight)
            category: str = str(recipe.get('category', ''))
            if query_lower in category.lower():
                score += 8

            # Check tags (medium weight)
            raw_tags = recipe.get('tags', [])
            tags: List[str] = [str(tag).lower() for tag in raw_tags] if isinstance(
                raw_tags, list) else []
            for tag in tags:
                if query_lower in tag or any(word in tag for word in query_words):
                    score += 3

            # Check ingredients (lower weight)
            raw_ingredients = recipe.get('ingredients', [])
            ingredients: List[str] = [str(ing).lower(
            ) for ing in raw_ingredients] if isinstance(raw_ingredients, list) else []
            for ingredient in ingredients:
                if any(word in ingredient for word in query_words):
                    score += 1

            if score > 0:
                results.append({
                    'recipe_id': recipe_id,
                    'name': name,
                    'resource_uri': f'res://{recipe_id}',
                    'category': category,
                    'difficulty': str(recipe.get('difficulty', '')),
                    'score': score
                })

        # Sort by score and return top results
        results.sort(key=lambda x: int(
            x['score']), reverse=True)  # type: ignore
        return results[:max_results]

    def find_recipes_by_dietary(
        self,
        dietary_restriction: Literal["vegan",
                                     "vegetarian", "gluten-free", "dairy-free"]
    ) -> list[str]:
        """Find recipes matching specific dietary restrictions (vegan, vegetarian, gluten-free, dairy-free).

        For general recipe search by cuisine, ingredients, or dish type, use search_recipes instead.
        """

        matching: List[str] = []
        for _rid, recipe in RECIPES.items():
            raw_dietary = recipe.get('dietary', [])
            dietary_list: List[str] = [str(x) for x in raw_dietary] if isinstance(
                raw_dietary, list) else []
            if str(dietary_restriction) in dietary_list:
                matching.append(str(recipe.get('name', '')))

        return matching

    def get_recipe_details(self, resource_uri: str) -> dict:
        """Return full recipe details (ingredients + instructions) with Markdown summary.

        Args:
            resource_uri: Recipe URI like "res://thai_green_curry"
        """
        recipe_id = resource_uri.replace('res://', '').strip()
        if recipe_id not in RECIPES:
            return {"error": f"Recipe '{recipe_id}' not found"}

        recipe: Dict[str, Any] = RECIPES[recipe_id]

        # Build markdown summary
        lines: List[str] = []
        lines.append(f"# {recipe['name']}")
        lines.append("")
        lines.append(f"- **Category**: {recipe['category']}")
        if recipe.get('dietary'):
            lines.append(f"- **Dietary**: {', '.join(recipe['dietary'])}")
        lines.append(f"- **Servings**: {recipe['servings']}")
        lines.append(f"- **Difficulty**: {recipe['difficulty']}")
        lines.append(f"- **Prep Time**: {recipe['prep_time']} min")
        lines.append(f"- **Cook Time**: {recipe['cook_time']} min")
        lines.append("")
        lines.append("## Ingredients")
        for ing in recipe.get('ingredients', []):
            lines.append(f"- {ing}")
        lines.append("")
        lines.append("## Instructions")
        for idx, step in enumerate(recipe.get('instructions', []), start=1):
            lines.append(f"{idx}. {step}")
        lines.append("")
        markdown = '\n'.join(lines)

        return {
            "name": recipe['name'],
            "category": recipe['category'],
            "dietary": recipe.get('dietary', []),
            "servings": recipe['servings'],
            "difficulty": recipe['difficulty'],
            "prep_time": recipe['prep_time'],
            "cook_time": recipe['cook_time'],
            "ingredients": recipe.get('ingredients', []),
            "instructions": recipe.get('instructions', []),
            "markdown": markdown
        }

    def get_recipe_ingredients(self, resource_uri: str) -> dict:
        """Return only the ingredients for a recipe (+ Markdown list)."""
        recipe_id = resource_uri.replace('res://', '').strip()
        if recipe_id not in RECIPES:
            return {"error": f"Recipe '{recipe_id}' not found"}

        recipe: Dict[str, Any] = RECIPES[recipe_id]
        ingredients = recipe.get('ingredients', [])
        markdown = "\n".join(
            [f"# {recipe['name']} - Ingredients", "", *[f"- {i}" for i in ingredients]])
        return {
            "name": recipe['name'],
            "ingredients": ingredients,
            "markdown": markdown
        }

    def get_recipe_steps(self, resource_uri: str) -> dict:
        """Return only the instructions for a recipe (+ Markdown steps)."""
        recipe_id = resource_uri.replace('res://', '').strip()
        if recipe_id not in RECIPES:
            return {"error": f"Recipe '{recipe_id}' not found"}

        recipe: Dict[str, Any] = RECIPES[recipe_id]
        steps = recipe.get('instructions', [])
        lines = [f"# {recipe['name']} - Instructions", ""]
        lines.extend([f"{i}. {s}" for i, s in enumerate(steps, start=1)])
        markdown = "\n".join(lines)
        return {
            "name": recipe['name'],
            "instructions": steps,
            "markdown": markdown
        }

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

    def resource_pad_thai(self) -> dict:
        """Pad Thai with Shrimp - Classic Thai street food"""
        recipe = RECIPES["pad_thai"]
        return {
            "mimeType": "application/json",
            "text": json.dumps(recipe, indent=2)
        }

    def resource_thai_basil_chicken(self) -> dict:
        """Thai Basil Chicken (Pad Krapow Gai) - Quick and spicy Thai dish"""
        recipe = RECIPES["thai_basil_chicken"]
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

    # Italian Recipe Resources
    def resource_spaghetti_carbonara(self) -> dict:
        """Classic Spaghetti Carbonara - Traditional Roman pasta dish"""
        recipe = RECIPES["spaghetti_carbonara"]
        return {
            "mimeType": "application/json",
            "text": json.dumps(recipe, indent=2)
        }

    def resource_risotto_milanese(self) -> dict:
        """Risotto alla Milanese - Creamy saffron risotto from Milan"""
        recipe = RECIPES["risotto_milanese"]
        return {
            "mimeType": "application/json",
            "text": json.dumps(recipe, indent=2)
        }

    def resource_caprese_salad(self) -> dict:
        """Caprese Salad - Fresh Italian tomato and mozzarella salad"""
        recipe = RECIPES["caprese_salad"]
        return {
            "mimeType": "application/json",
            "text": json.dumps(recipe, indent=2)
        }

    # French Recipe Resources
    def resource_coq_au_vin(self) -> dict:
        """Coq au Vin - Classic French chicken braised in wine"""
        recipe = RECIPES["coq_au_vin"]
        return {
            "mimeType": "application/json",
            "text": json.dumps(recipe, indent=2)
        }

    def resource_ratatouille(self) -> dict:
        """Ratatouille - Provençal vegetable stew"""
        recipe = RECIPES["ratatouille"]
        return {
            "mimeType": "application/json",
            "text": json.dumps(recipe, indent=2)
        }

    def resource_quiche_lorraine(self) -> dict:
        """Quiche Lorraine - Traditional French bacon and cheese quiche"""
        recipe = RECIPES["quiche_lorraine"]
        return {
            "mimeType": "application/json",
            "text": json.dumps(recipe, indent=2)
        }

    # British Recipe Resources
    def resource_fish_and_chips(self) -> dict:
        """Fish and Chips - Classic British pub food"""
        recipe = RECIPES["fish_and_chips"]
        return {
            "mimeType": "application/json",
            "text": json.dumps(recipe, indent=2)
        }

    def resource_beef_wellington(self) -> dict:
        """Beef Wellington - Elegant British beef wrapped in pastry"""
        recipe = RECIPES["beef_wellington"]
        return {
            "mimeType": "application/json",
            "text": json.dumps(recipe, indent=2)
        }

    def resource_shepherds_pie(self) -> dict:
        """Shepherd's Pie - Traditional British comfort food"""
        recipe = RECIPES["shepherds_pie"]
        return {
            "mimeType": "application/json",
            "text": json.dumps(recipe, indent=2)
        }

    # Swedish Recipe Resources
    def resource_gravlax(self) -> dict:
        """Gravlax - Traditional Swedish cured salmon"""
        recipe = RECIPES["gravlax"]
        return {
            "mimeType": "application/json",
            "text": json.dumps(recipe, indent=2)
        }

    def resource_meatballs_swedish(self) -> dict:
        """Swedish Meatballs - Classic Scandinavian comfort food"""
        recipe = RECIPES["meatballs_swedish"]
        return {
            "mimeType": "application/json",
            "text": json.dumps(recipe, indent=2)
        }

    def resource_smorgasbord_salad(self) -> dict:
        """Smörgåsbord Salad - Fresh Swedish mixed greens salad"""
        recipe = RECIPES["smorgasbord_salad"]
        return {
            "mimeType": "application/json",
            "text": json.dumps(recipe, indent=2)
        }

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

The system will automatically search for relevant recipes using semantic search.
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
