"""
Fitness Trainer MCP Server - Personal fitness and workout assistant

Features:
- 🏋️ TOOLS: BMI calculator, calorie tracking, workout planner
- 📚 RESOURCES: Workout routines, exercise guides, nutrition info
- 🎯 PROMPTS: Fitness workflows (goal setting, form coaching)
"""

from typing import Literal, Optional, Any, Dict, List
try:
    from mcp_core import McpServer, attach_pyodide_worker  # type: ignore
except ImportError:  # Fallback for static analysis/linting environments
    class McpServer:  # type: ignore
        pass

    def attach_pyodide_worker(_svc: object) -> None:  # type: ignore
        pass
import json


# ============================================================================
# Workout Programs Database
# ============================================================================

WORKOUT_PROGRAMS = {
    "beginner_strength": {
        "name": "Beginner Strength Training",
        "level": "beginner",
        "goal": "build strength",
        "duration_weeks": 8,
        "days_per_week": 3,
        "equipment": ["dumbbells", "bench"],
        "description": "Full-body strength training program for beginners",
        "workouts": {
            "day_a": {
                "name": "Full Body A",
                "exercises": [
                    {"name": "Goblet Squats", "sets": 3,
                        "reps": "10-12", "rest": "90s"},
                    {"name": "Dumbbell Bench Press", "sets": 3,
                        "reps": "8-10", "rest": "90s"},
                    {"name": "Bent-Over Dumbbell Rows", "sets": 3,
                        "reps": "10-12", "rest": "90s"},
                    {"name": "Dumbbell Shoulder Press",
                        "sets": 3, "reps": "8-10", "rest": "90s"},
                    {"name": "Plank", "sets": 3, "reps": "30-60s", "rest": "60s"}
                ]
            },
            "day_b": {
                "name": "Full Body B",
                "exercises": [
                    {"name": "Romanian Deadlift", "sets": 3,
                        "reps": "10-12", "rest": "90s"},
                    {"name": "Incline Dumbbell Press", "sets": 3,
                        "reps": "8-10", "rest": "90s"},
                    {"name": "Dumbbell Pullover", "sets": 3,
                        "reps": "10-12", "rest": "90s"},
                    {"name": "Lateral Raises", "sets": 3,
                        "reps": "12-15", "rest": "60s"},
                    {"name": "Russian Twists", "sets": 3,
                        "reps": "20", "rest": "60s"}
                ]
            }
        }
    },
    "cardio_hiit": {
        "name": "HIIT Cardio Program",
        "level": "intermediate",
        "goal": "fat loss",
        "duration_weeks": 6,
        "days_per_week": 4,
        "equipment": ["none"],
        "description": "High-intensity interval training for fat burning",
        "workouts": {
            "hiit_20": {
                "name": "20-Minute HIIT",
                "format": "30s work, 30s rest",
                "rounds": 10,
                "exercises": [
                    "Jumping Jacks",
                    "Burpees",
                    "Mountain Climbers",
                    "High Knees",
                    "Jump Squats"
                ]
            },
            "tabata": {
                "name": "Tabata Training",
                "format": "20s work, 10s rest",
                "rounds": 8,
                "exercises": [
                    "Squat Jumps",
                    "Push-ups",
                    "Plank Jacks",
                    "Bicycle Crunches"
                ]
            }
        }
    },
    "yoga_flexibility": {
        "name": "Yoga & Flexibility",
        "level": "all levels",
        "goal": "flexibility",
        "duration_weeks": 4,
        "days_per_week": 5,
        "equipment": ["yoga mat"],
        "description": "Improve flexibility and mobility through yoga",
        "workouts": {
            "morning_flow": {
                "name": "Morning Yoga Flow",
                "duration": "20 minutes",
                "poses": [
                    {"name": "Cat-Cow", "duration": "2 min",
                        "benefit": "spine mobility"},
                    {"name": "Downward Dog", "duration": "1 min",
                        "benefit": "full body stretch"},
                    {"name": "Warrior I", "duration": "30s each side",
                        "benefit": "hip flexibility"},
                    {"name": "Triangle Pose", "duration": "30s each side",
                        "benefit": "hamstring stretch"},
                    {"name": "Pigeon Pose", "duration": "1 min each side",
                        "benefit": "hip opening"},
                    {"name": "Child's Pose", "duration": "2 min",
                        "benefit": "relaxation"}
                ]
            }
        }
    }
}


EXERCISES_DB = {
    "squat": {
        "name": "Barbell Squat",
        "category": "legs",
        "difficulty": "intermediate",
        "equipment": "barbell",
        "primary_muscles": ["quadriceps", "glutes"],
        "secondary_muscles": ["hamstrings", "core"],
        "instructions": [
            "Position bar on upper back",
            "Feet shoulder-width apart",
            "Descend by bending knees and hips",
            "Keep chest up and core tight",
            "Lower until thighs parallel to ground",
            "Drive through heels to return to start"
        ],
        "common_mistakes": [
            "Knees caving inward",
            "Heels lifting off ground",
            "Rounding lower back",
            "Not going deep enough"
        ]
    },
    "push_up": {
        "name": "Push-Up",
        "category": "chest",
        "difficulty": "beginner",
        "equipment": "bodyweight",
        "primary_muscles": ["chest", "triceps"],
        "secondary_muscles": ["shoulders", "core"],
        "instructions": [
            "Start in plank position, hands shoulder-width",
            "Lower body by bending elbows",
            "Keep core tight and body straight",
            "Descend until chest nearly touches floor",
            "Push back up to starting position"
        ],
        "progressions": [
            "Wall push-ups (easiest)",
            "Incline push-ups",
            "Standard push-ups",
            "Decline push-ups",
            "One-arm push-ups (hardest)"
        ]
    }
}


# ============================================================================
# Fitness Trainer MCP Server
# ============================================================================

class FitnessService(McpServer):

    # ===== TOOLS =====

    def calculate_bmi(self, weight_kg: float, height_cm: float) -> dict:
        """Calculate Body Mass Index (BMI)"""

        height_m = height_cm / 100
        bmi = weight_kg / (height_m ** 2)

        if bmi < 18.5:
            category = "Underweight"
            advice = "Consider consulting a healthcare provider for nutritional guidance"
        elif bmi < 25:
            category = "Normal weight"
            advice = "Maintain your current lifestyle with balanced diet and exercise"
        elif bmi < 30:
            category = "Overweight"
            advice = "Consider increasing physical activity and reviewing diet"
        else:
            category = "Obese"
            advice = "Consult healthcare provider for personalized weight management plan"

        return {
            "bmi": round(bmi, 1),
            "category": category,
            "advice": advice,
            "note": "BMI is a general indicator; consult healthcare professional for personalized assessment"
        }

    def estimate_calories(
        self,
        weight_kg: float,
        height_cm: float,
        age: int,
        sex: Literal["male", "female"],
        activity_level: Literal["sedentary", "light",
                                "moderate", "active", "very_active"]
    ) -> dict:
        """Estimate daily calorie needs using Mifflin-St Jeor equation"""

        # Calculate BMR
        if sex == "male":
            bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) + 5
        else:
            bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) - 161

        # Activity multipliers
        activity_multipliers = {
            "sedentary": 1.2,
            "light": 1.375,
            "moderate": 1.55,
            "active": 1.725,
            "very_active": 1.9
        }

        tdee = bmr * activity_multipliers[activity_level]

        return {
            "bmr": round(bmr),
            "tdee": round(tdee),
            "maintenance": round(tdee),
            "weight_loss": round(tdee - 500),
            "weight_gain": round(tdee + 300),
            "note": "For weight loss: -500 cal/day = ~1 lb/week loss"
        }

    def one_rep_max(self, weight: float, reps: int) -> dict:
        """Calculate estimated one-rep max from weight and reps"""

        if reps == 1:
            return {"one_rep_max": weight, "note": "Actual 1RM"}

        # Epley formula
        orm = weight * (1 + reps / 30)

        # Calculate percentages for different rep ranges
        return {
            "estimated_1rm": round(orm, 1),
            "training_weights": {
                "1_rep": round(orm * 1.0, 1),
                "3_reps": round(orm * 0.90, 1),
                "5_reps": round(orm * 0.85, 1),
                "8_reps": round(orm * 0.80, 1),
                "10_reps": round(orm * 0.75, 1),
                "12_reps": round(orm * 0.70, 1)
            },
            "note": "Estimates based on Epley formula"
        }

    def workout_tracker(
        self,
        exercise: str,
        sets: int,
        reps: int,
        weight: Optional[float] = None
    ) -> dict:
        """Log a workout exercise"""

        total_reps = sets * reps
        volume = (sets * reps * weight) if weight else 0

        return {
            "exercise": exercise,
            "sets": sets,
            "reps": reps,
            "weight": weight,
            "total_reps": total_reps,
            "total_volume": round(volume, 1) if weight else None,
            "logged": True
        }

    def get_workout_details(self, resource_uri: str) -> dict:
        """Get complete workout details including exercises, sets, reps, and rest periods.

        Args:
            resource_uri: The workout resource URI (e.g., "res://beginner_strength")

        Returns:
            Complete workout details with all exercises, sets, reps formatted for display,
            plus a markdown summary for clean UI rendering.
        """
        # Extract program ID from URI
        program_id = resource_uri.replace("res://", "")

        if program_id not in WORKOUT_PROGRAMS:
            return {"error": f"Workout '{program_id}' not found"}

        program: Dict[str, Any] = WORKOUT_PROGRAMS[program_id]

        # Format exercises for clear display
        formatted_workouts: Dict[str, Any] = {}
        workouts_data: Dict[str, Any] = program.get("workouts", {}) or {}
        for day_id, day_data in workouts_data.items():
            day_dict: Dict[str, Any] = day_data if isinstance(
                day_data, dict) else {}
            exercises: List[Dict[str, Any]] = []

            # Handle different workout formats (exercises list vs poses list)
            exercise_list: List[Dict[str, Any]] = (
                day_dict.get("exercises")
                or day_dict.get("poses")
                or []
            )

            for ex in exercise_list:
                # Handle both string and dict formats
                if isinstance(ex, str):
                    # Simple string format (like HIIT exercises)
                    exercise_info = {
                        "name": ex,
                        "sets": "N/A",
                        "reps": "N/A",
                        "rest": "N/A"
                    }
                else:
                    # Dictionary format (like strength training)
                    exercise_info = {
                        "name": ex["name"],
                        "sets": ex.get("sets", "N/A"),
                        "reps": ex.get("reps", ex.get("duration", "N/A")),
                        "rest": ex.get("rest", "N/A")
                    }
                    # Add benefit for yoga poses
                    if "benefit" in ex:
                        exercise_info["benefit"] = ex["benefit"]
                exercises.append(exercise_info)

            formatted_workouts[day_id] = {
                "name": day_dict.get("name", day_id),
                "format": day_dict.get("format"),
                "duration": day_dict.get("duration"),
                "rounds": day_dict.get("rounds"),
                "exercises": exercises
            }

        # Build a markdown summary for easy display
        lines = []
        lines.append(f"# {program['name']}")
        lines.append("")
        lines.append(f"- **Goal**: {program['goal']}")
        lines.append(f"- **Level**: {program['level']}")
        lines.append(f"- **Duration**: {program['duration_weeks']} weeks")
        lines.append(f"- **Frequency**: {program['days_per_week']} days/week")
        equipment_list = program.get('equipment', []) or []
        lines.append(f"- **Equipment**: {', '.join(map(str, equipment_list))}")
        if program.get('description'):
            lines.append("")
            lines.append(str(program['description']))
        lines.append("")

        for day_id, day in formatted_workouts.items():
            lines.append(f"## {day['name']}")
            if day.get('format'):
                lines.append(f"- **Format**: {day['format']}")
            if day.get('rounds'):
                lines.append(f"- **Rounds**: {day['rounds']}")
            if day.get('duration'):
                lines.append(f"- **Duration**: {day['duration']}")
            lines.append("")
            for ex in day['exercises']:
                parts = [f"- {ex['name']}"]
                if ex.get('sets') != "N/A" and ex.get('reps') != "N/A":
                    parts.append(f"{ex['sets']}×{ex['reps']}")
                elif ex.get('sets') != "N/A":
                    parts.append(f"{ex['sets']} sets")
                elif ex.get('reps') != "N/A":
                    parts.append(f"{ex['reps']}")
                if ex.get('rest') and ex['rest'] != "N/A":
                    parts.append(f"({ex['rest']} rest)")
                if ex.get('benefit'):
                    parts.append(f"– {ex['benefit']}")
                lines.append(' '.join(parts))
            lines.append("")

        markdown = '\n'.join(lines)

        return {
            "name": program["name"],
            "level": program["level"],
            "goal": program["goal"],
            "duration": f"{program['duration_weeks']} weeks",
            "frequency": f"{program['days_per_week']} days/week",
            "equipment": program["equipment"],
            "description": program["description"],
            "workouts": formatted_workouts,
            "markdown": markdown
        }

    def find_workouts(
        self,
        goal: Literal["build strength", "fat loss", "flexibility", "endurance"],
        level: Literal["beginner", "intermediate", "advanced"] = "beginner"
    ) -> list[dict]:
        """Find workout programs matching goals and fitness level.

        Goals: "build strength", "fat loss", "flexibility", "endurance"
        Levels: "beginner", "intermediate", "advanced"

        Example: find_workouts(goal="fat loss", level="intermediate")

        Returns exact matches first, then adjacent difficulty levels if no exact match.
        """
        # Level adjacency map for fallback suggestions
        level_order = ["beginner", "intermediate", "advanced"]
        try:
            level_idx = level_order.index(level)
            adjacent_levels = []
            if level_idx > 0:
                adjacent_levels.append(level_order[level_idx - 1])
            if level_idx < len(level_order) - 1:
                adjacent_levels.append(level_order[level_idx + 1])
        except ValueError:
            adjacent_levels = []

        exact_matches = []
        fallback_matches = []

        for program_id, program in WORKOUT_PROGRAMS.items():
            goal_match = program['goal'] == goal
            prog_level = program['level']

            if goal_match:
                if prog_level == level or prog_level == "all levels":
                    # Exact match
                    exact_matches.append({
                        "name": program['name'],
                        "resource_uri": f"res://{program_id}",
                        "level": prog_level,
                        "duration": f"{program['duration_weeks']} weeks",
                        "frequency": f"{program['days_per_week']} days/week",
                        "match_type": "exact"
                    })
                elif prog_level in adjacent_levels:
                    # Adjacent level fallback
                    fallback_matches.append({
                        "name": program['name'],
                        "resource_uri": f"res://{program_id}",
                        "level": prog_level,
                        "duration": f"{program['duration_weeks']} weeks",
                        "frequency": f"{program['days_per_week']} days/week",
                        "match_type": "similar_level",
                        "note": f"Alternative at {prog_level} level"
                    })

        # Return exact matches first, then fallbacks
        return exact_matches + fallback_matches

    # ===== RESOURCES (Workout Programs) =====

    def resource_beginner_strength(self) -> dict:
        """Beginner Strength Training Program - Full-body workouts for building foundation"""
        program = WORKOUT_PROGRAMS["beginner_strength"]
        return {
            "mimeType": "application/json",
            "text": json.dumps(program, indent=2)
        }

    def resource_cardio_hiit(self) -> dict:
        """HIIT Cardio Program - High-intensity intervals for fat loss"""
        program = WORKOUT_PROGRAMS["cardio_hiit"]
        return {
            "mimeType": "application/json",
            "text": json.dumps(program, indent=2)
        }

    def resource_yoga_flexibility(self) -> dict:
        """Yoga & Flexibility Program - Improve mobility and reduce stress"""
        program = WORKOUT_PROGRAMS["yoga_flexibility"]
        return {
            "mimeType": "application/json",
            "text": json.dumps(program, indent=2)
        }

    def resource_exercise_form_guide(self) -> str:
        """Exercise Form and Technique Guide"""
        return """# Exercise Form Guide

## Fundamental Principles

### 1. Proper Breathing
- Exhale during exertion (lifting/pushing)
- Inhale during easier phase (lowering)
- Never hold your breath

### 2. Core Engagement
- Brace your abs as if preparing for a punch
- Maintain neutral spine
- Protect lower back

### 3. Controlled Movement
- Avoid using momentum
- 2 seconds up, 2 seconds down
- Full range of motion

### 4. Progressive Overload
- Gradually increase weight, reps, or sets
- Track your workouts
- Rest and recover adequately

## Common Exercise Mistakes

### Squats
❌ Knees caving inward → ✅ Push knees out in line with toes
❌ Heels lifting → ✅ Keep full foot planted
❌ Rounding back → ✅ Keep chest up, core tight

### Push-ups
❌ Sagging hips → ✅ Maintain plank position
❌ Flaring elbows → ✅ Elbows at 45-degree angle
❌ Incomplete range → ✅ Chest to floor

### Deadlifts
❌ Rounding back → ✅ Neutral spine throughout
❌ Lifting with back → ✅ Drive with legs
❌ Jerking weight → ✅ Smooth, controlled pull

## Warm-up Protocol
1. 5-10 min light cardio (raise heart rate)
2. Dynamic stretches (leg swings, arm circles)
3. Movement-specific warm-up sets (50%, 75% of working weight)

## Cool-down Protocol
1. 5-10 min light cardio (lower heart rate)
2. Static stretching (hold 30 seconds each)
3. Foam rolling (target worked muscles)
"""

    def resource_nutrition_basics(self) -> str:
        """Basic Nutrition Guide for Fitness"""
        return """# Fitness Nutrition Basics

## Macronutrients

### Protein (4 cal/g)
- **Role**: Muscle repair and growth
- **Target**: 0.8-1g per lb body weight
- **Sources**: Chicken, fish, eggs, legumes, tofu

### Carbohydrates (4 cal/g)
- **Role**: Energy for workouts
- **Target**: 2-3g per lb body weight (active)
- **Sources**: Rice, oats, fruits, vegetables, whole grains

### Fats (9 cal/g)
- **Role**: Hormone production, nutrient absorption
- **Target**: 0.3-0.4g per lb body weight
- **Sources**: Avocado, nuts, olive oil, fatty fish

## Meal Timing

### Pre-Workout (1-2 hours before)
- Moderate carbs + small protein
- Example: Banana with peanut butter

### Post-Workout (within 1 hour)
- High protein + carbs
- Example: Protein shake with fruit

### Daily Distribution
- 3-5 meals per day
- Consistent meal timing
- Don't skip breakfast

## Hydration
- Minimum: Body weight (lbs) / 2 = ounces per day
- More during workouts
- Urine should be light yellow

## Supplements (Optional)
1. **Protein Powder** - Convenient protein source
2. **Creatine** - Strength and performance
3. **Multivitamin** - Cover nutritional gaps
4. **Omega-3** - Joint health, inflammation

**Note**: Supplements are supplementary. Focus on whole foods first!
"""

    # ===== PROMPTS (Fitness Workflows) =====

    def prompt_goal_setting(self) -> dict:
        """Help set SMART fitness goals"""
        return {
            "description": "Fitness goal setting coach",
            "messages": [{
                "role": "system",
                "content": """You are a fitness goal-setting coach. Help users create SMART goals:

**S**pecific - Clear and well-defined
**M**easurable - Track progress with numbers
**A**chievable - Realistic given current fitness
**R**elevant - Aligned with personal values
**T**ime-bound - Specific deadline

Your process:
1. **Assess**: Ask about current fitness, experience, lifestyle
2. **Define**: Help articulate specific, measurable goal
3. **Plan**: Break into milestones (4-12 week blocks)
4. **Resources**: Recommend workout program resources
5. **Track**: Suggest metrics to monitor

Use find_workouts to match goals with programs.
Be encouraging but realistic about timelines."""
            }]
        }

    def prompt_form_checker(self) -> dict:
        """Guide proper exercise form and technique"""
        return {
            "description": "Exercise form and technique coach",
            "messages": [{
                "role": "system",
                "content": """You are an exercise form coach focused on safety and effectiveness.

Your approach:
1. **Explain**: Describe proper form step-by-step
2. **Visualize**: Help them feel correct positions
3. **Common Errors**: Warn about typical mistakes
4. **Cues**: Provide mental cues for remembering form
5. **Progressions**: Suggest easier variations if needed

Reference the exercise_form_guide resource for details.
Safety is paramount - always emphasize proper form over heavy weight.
Ask if they feel pain (stop immediately) vs. muscle burn (normal)."""
            }]
        }

    def prompt_nutrition_coach(self) -> dict:
        """Personalized nutrition guidance"""
        return {
            "description": "Nutrition planning for fitness goals",
            "messages": [{
                "role": "system",
                "content": """You are a nutrition coach helping optimize diet for fitness.

Your guidance:
1. **Calculate**: Use estimate_calories to determine needs
2. **Macros**: Set protein/carb/fat targets based on goal
3. **Meal Plan**: Suggest simple, practical meal ideas
4. **Timing**: Optimize nutrient timing around workouts
5. **Adjustments**: Monitor progress and adjust as needed

Reference nutrition_basics resource for guidelines.
Emphasize sustainability over extreme diets.
Consider food preferences and lifestyle constraints."""
            }]
        }

    def prompt_workout_programmer(self) -> dict:
        """Design custom workout programs"""
        return {
            "description": "Custom workout program designer",
            "messages": [{
                "role": "system",
                "content": """You are a workout programmer creating personalized training plans.

Program design principles:
1. **Assess**: Fitness level, goals, equipment, schedule
2. **Structure**: Choose appropriate split (full-body, upper/lower, etc.)
3. **Exercises**: Select based on available equipment
4. **Progression**: Plan how to increase difficulty over time
5. **Recovery**: Include rest days and deload weeks

Use find_workouts as templates.
Reference workout program resources for examples.
Prioritize compound movements for beginners.
Include warm-up and cool-down protocols."""
            }]
        }


def boot():
    """Boot the Fitness Trainer MCP server"""
    svc = FitnessService()
    attach_pyodide_worker(svc)
