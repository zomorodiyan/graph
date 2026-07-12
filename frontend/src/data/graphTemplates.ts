// Sample graphs offered to new users via the "New Graph" card's left zone.
// `structure` is 2-space-indented text in the same format as clipboard paste:
//   - a line is an item; nesting is by indentation (depth is free-form)
//   - `progress: X/Y` (shown as "X%" when Y is 100, otherwise "X/Y") are
//     properties of the item above
//   - `due: +Nd` is a deadline N days from the moment the template is instantiated
//     (resolved to a real YYYY-MM-DD by `resolveTemplateDates`); a negative N is
//     allowed for dates meant to already be overdue in the sample
//   - a "quoted" line sets that item's context note
// Each template flexes the features differently to suit its domain.

export interface GraphTemplate {
  name: string          // url-safe base name (deduped at create time)
  displayName: string
  description: string
  structure: string
}

// Replaces `due: +Nd` with a real YYYY-MM-DD, N days from `now` (today by default).
// Templates author dates as offsets so they never read as stale/overdue no matter
// when a user creates the sample graph.
export function resolveTemplateDates(structure: string, now: Date = new Date()): string {
  return structure.replace(/due:\s*([+-]\d+)d\s*$/gm, (_match, offset: string) => {
    const d = new Date(now)
    d.setDate(d.getDate() + Number(offset))
    return `due: ${d.toISOString().slice(0, 10)}`
  })
}

export const GRAPH_TEMPLATES: GraphTemplate[] = [
  {
    name: 'career',
    displayName: 'Career',
    description: 'Research, advising, growth',
    structure: `Projects
  Process Simulation
    progress: 3/5
    due: +67d
    "Parameters drive part quality"
  Multi-Material
    progress: 2/4
    "Interface behavior, dissimilar materials"
  Digital Twin
    progress: 1/4
    "Sensor data feeds defect predictions"
Advising
  Advisor Meeting
    due: +0d
    "Bring blockers, not status"
  Lab Meeting
    progress: 3/4
  Committee
    Qualifying Exam Feedback
      progress: 60/100
      due: +36d
      "Feeds the candidacy defense"
Outreach
  Grant Proposal
    progress: 1/4
    due: +22d
    Problem Statement
    Draft Narrative
      "Get advisor feedback first"
    Budget Justification
  Conference Talk
    progress: 1/3
Goals
  Publications
    Laser Interaction
      progress: 1/3
      due: +67d
      "Pick venue before drafting"
      Checkpoint 1
        due: +5d
      Checkpoint 2
        due: +36d
      Checkpoint 3
        due: +67d
    Multi-Material Simulation
      progress: 1/3
      due: +67d
      Checkpoint 1
        due: +5d
      Checkpoint 2
        due: +36d
      Checkpoint 3
        due: +67d
  Candidacy Exam
    progress: 3/6
    due: +189d
    "Track committee feedback"
  Internship
    progress: 1/5
    "No citizenship requirement needed"
  Next Position
    Postdoc
    Research Scientist
    "Start search a year out"`,
  },
  {
    name: 'personal',
    displayName: 'Personal',
    description: 'People, health, home, downtime',
    structure: `People
  Family
    Parents
      "Call every Sunday"
    Siblings
      Sister
        "Birthday — Mar 12"
      Brother
  Friends
    Close
      Alex
      Sam
    College
    Work
  Nurture
    Reach Out
      "It's been almost a year"
    Birthdays
    Thank Yous
Practice
  Skills
    Japanese
      progress: 15/100
      Section 1
        progress: 9/9
        Lessons 1-5
          progress: 15/15
          "Order Food, Describe People, Introduce Yourself, Order Food and Drink, Talk About Countries"
        Lessons 6-9
          progress: 12/12
          "Ask for Directions, Describe Belongings, Talk About Neighbors, Tell Time"
      Section 2
        progress: 15/30
        Lessons 1-5
          progress: 15/15
          "Get Help When Traveling, Get to Know People, Describe Your Family, Talk About Hobbies, Describe Eating Habits"
        Lessons 6-10
          progress: 15/15
          "Shop for Clothes, Order Food and Drink, Use Present Tense Verbs, Get Around a Station, Describe Your Routine"
        Lessons 11-15
          progress: 15/15
          "Talk About Interests, Describe Your Home, Take Public Transit, Use Na-Adjectives, Get Emergency Help"
        Lessons 16-20
          "Talk About Weather, Discuss Chores, Say What You Want to Do, Discuss a Family Visit, Order Pastries"
        Lessons 21-25
          "Use Negative Verbs, Discuss Classes, Talk About Jobs, Get Around a Theme Park, Discuss Media"
        Lessons 26-28
          "Communication at Work, Discuss Seasonal Events, Talk About Date Plans"
      Speaking
        Weekly Tutor
          due: +2d
    Chess
      progress: 6/20
      "Tactics puzzles most days"
  Queue
    Systems Design
    Photography
    Surfing
    Redwoods Trip
      "Coming target"
  Output
    Notes
    Blog Posts
Health
  Fitness
    progress: 4/7
    Cardio
      Run
        "10 min"
    Lower Back
      progress: 60/100
      "Recovering — nags after long desk days"
      PT Checkup
        due: +15d
      Bird Dog
      Dead Bug
    Knee
      Terminal Knee Extension
      Step-Ups
      Wall Sit
    Shoulder
      Face Pulls
      Band Pull-Aparts
      Scapular Push-Ups
    General
      Squat
        progress: 70/100
      Deadlift
        "1x5 @ 120kg"
      Bench Press
        "3x5 @ 80kg, then deload"
  Nutrition
    Hydration
      "Target 2.5L per day"
    Calories
      "Target ~2325 kcal per day (155lb x 15 kcal/lb)"
      Breakfast
        "~580 kcal"
      Lunch
        "~815 kcal"
      Dinner
        "~700 kcal"
      Snacks
        "~230 kcal"
    Protein
      "Target ~124g per day (155lb x 0.8g/lb)"
      Breakfast
        "~31g"
      Lunch
        "~43g"
      Dinner
        "~37g"
      Snacks
        "~13g"
    Fiber
      "Target ~30g per day"
    Sugar & Processed Food
      "Keep added sugar under 30g per day"
  Recovery
    Sleep
      "7-8 hours, consistent schedule"
  Metrics
    Weight
    Bloodwork
      due: +144d
Kitchen
  Recipes
    Weeknight
      Stir Fry
        "20 minutes, one pan"
      Pasta Primavera
    Breakfast
      Bread, Cheese, Walnuts or Vegetables
      Sweetened Tea
      Boiled Eggs
    Batch Meals
      Tomato Stew
        progress: 0/4
        "Freeze the rest"
      Vegetable Stew
        progress: 0/4
        "Freeze the rest"
      Lasagna
        progress: 0/4
        "Freeze the rest"
    To Try
      Thai Green Curry
      Shakshuka
  Groceries
    Produce
      "Bok choy for stir fry"
    Pantry
      "Grains for batch cook"
      Rice
      Potato
      Onion
        progress: 0/1
        "Out — restock"
      Oil
      Spices
      Bread
      Milk
      Sugar
      Yogurt
      Fruits
      Vegetables
        progress: 0/1
        "Out — restock"
      Lemons
        progress: 0/1
        "Out — restock"
      Eggs
      Walnuts
    Proteins
      "Tofu for stir fry"
  Meal Prep
    Batch Cook
      "Sundays, grains and roast veg"
    Freezer Meals
Chores
  Bedroom
    Clean
    Laundry
  Bathroom
    Clean
    Bathe
  Kitchen
    Clean
    Dishes
Leisure
  Reading
    Sci-Fi
  Watchlist
    Anime
      Watching
        One Piece
          progress: 1085/1120
          "Egghead arc, no spoilers"
        Attack on Titan
          progress: 4/4
          "Rewatching before final chapter"
      Queue
        Frieren
    Movies
      Oppenheimer
        "Recommended by Sam"
    Shows
      Severance
        progress: 6/9
    Games
      Hollow Knight: Silksong
        progress: 60/100
      Minecraft
    Documentaries
      Planet Earth
Finances
  progress: 1640/2300
  Fixed Costs
    progress: 1035/1120
    Rent
      progress: 950/950
      "Paid, my share of total"
    Insurance
      progress: 55/110
      "Share of total"
    Subscriptions
      progress: 30/60
      "Share of total"
  Budgeted
    progress: 425/880
    Groceries
      progress: 200/400
    Dining Out
      progress: 60/90
    Transport
      progress: 65/105
    Clothes
      progress: 0/80
    Household Supplies
      progress: 20/40
      "Cleaning, bathroom"
    Office Supplies
      progress: 10/25
      "Pens, paper, small gear"
    Personal Care
      progress: 30/60
    Health/Medical
      progress: 40/80
      "Copays, prescriptions"
  Investments
    progress: 300/300
    Roth IRA
      progress: 50/50
      "$50 per month"
    Emergency Fund
      progress: 250/250
      "$250 per month — lawyer, income gaps, health, gifts"
  Goals
    Pay Off Loan
      progress: 0/12000
      due: +1000d
Daily Rhythm
  Wake 6am
  Clean
  Breakfast
  Commute
  Workout
    "Alternate run and lift days"
  Plan Day
    Top 3 Tasks
  Focus
    "Phone in another room"
  Lunch
  Focus
  Commute
  Cook
    "Wed, Fri"
  Family Time
  Wind Down
    Read
      "30 min, no screens"
    Journal
      "One good, one hard"
  Sleep by 11pm
  Weekend
    Meal Prep
    Long Walk
    Grocery Run
      "Restock pantry, produce for the week"
    Review Budget
      "Check spend against Budgeted categories"
Admin
  Visa Status
    due: +53d
    "Renew before it expires"
  ID Renewal
  Taxes
    due: +279d`,
  },
]
