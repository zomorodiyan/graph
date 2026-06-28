// Sample graphs offered to new users via the "New Graph" card's left zone.
// `structure` is 2-space-indented text in the same format as clipboard paste:
//   - a line is an item; nesting is by indentation (depth is free-form)
//   - `progress: N` / `due: YYYY-MM-DD` are properties of the item above
//   - a "quoted" line sets that item's context note
// Each template flexes the features differently to suit its domain.

export interface GraphTemplate {
  name: string          // url-safe base name (deduped at create time)
  displayName: string
  description: string
  structure: string
}

export const GRAPH_TEMPLATES: GraphTemplate[] = [
  {
    name: 'earth',
    displayName: 'Earth',
    description: 'Land, sky, core',
    structure: `Surface
  Oceans & Waterways
    Oceans
      Pacific
        "Largest and deepest ocean basin"
        Mariana Trench
          "Deepest point on Earth, ~10,935 m down"
      Atlantic
      Indian
      Southern
      Arctic
    Freshwater
      Rivers
        Nile
        Amazon
          "Largest river by water discharge"
      Lakes
  Continents
    Asia
      "Largest continent, ~44.6M km²"
    Africa
    North America
    South America
    Antarctica
    Europe
    Australia
  Mountain Ranges
    Himalayas
      "Highest range on Earth"
      Everest
        "Tallest peak, ~8,849 m"
    Andes
      "Longest range, ~7,000 km"
    Alps
    Rockies
  Life
    Kingdoms
      Animalia
        "Multicellular and mobile; ~1.5M described species"
        Vertebrates
        Invertebrates
      Plantae
      Fungi
      Protista
      Bacteria
      Archaea
Atmosphere
  Layers
    Troposphere
      "0-12 km; holds ~75% of air mass and all weather"
    Stratosphere
      "12-50 km; contains the ozone layer"
    Mesosphere
      "50-85 km; meteors burn up here"
    Thermosphere
      "85-600 km; auroras and the ISS"
    Exosphere
      "600-10,000 km; fades into space"
  Weather & Phenomena
    Clouds
    Precipitation
      Rain
      Snow
    Storms
      Hurricanes
        "Sustained winds over 119 km/h, fueled by warm ocean water"
      Tornadoes
    Lightning
      "Channel reaches ~30,000 °C, hotter than the Sun's surface"
    Aurora
  Observable Universe
    "What reaches us through the sky"
    Sun
      "~150M km away (8 light-minutes); surface ~5,500 °C"
      Solar Radiation
        "Solar constant ~1,361 W/m² at the top of the atmosphere"
    Moon
      "~384,400 km away; its gravity drives the tides"
    Stars & Deep Sky
      "Nearest star ~4.2 light-years away"
      Milky Way
Interior
  Crust
    "Thin, rigid outer shell"
    Oceanic Crust
      "~7 km thick, basaltic"
    Continental Crust
      "~35 km thick, granitic"
  Mantle
    "~2,900 km thick; ~84% of Earth's volume"
    Upper Mantle
      Asthenosphere
        "Soft, slowly flowing rock the plates ride on"
    Lower Mantle
  Outer Core
    "Liquid iron-nickel; its motion generates the magnetic field"
  Inner Core
    "Solid iron, ~5,400 °C; nearly as hot as the Sun's surface"
  Dynamics
    "Interior heat drives surface change"
    Plate Tectonics
      "Plates drift ~2-10 cm per year"
      Earthquakes
      Volcanoes
    Magnetic Field
      "Shields Earth from solar wind; reverses over geologic time"`,
  },
  {
    name: 'work',
    displayName: 'Work',
    description: 'Projects and team',
    structure: `Projects
  Q3 Launch
    progress: 40
    due: 2026-09-15
    Backend
      API
        Auth
          OAuth Flow
          Token Refresh
        Endpoints
      Database
        Migrations
    Frontend
      Components
      State
    QA
      "Block release on any critical bug"
  Maintenance
    Bugs
    Tech Debt
Team
  Mentors
  Reports
Admin
  Expenses
  Reviews
    due: 2026-07-31`,
  },
  {
    name: 'health',
    displayName: 'Health',
    description: 'Train and recover',
    structure: `Fitness
  progress: 60
  Strength
    Push
      Bench Press
        "3x5 @ 80kg, then deload"
      Overhead Press
    Pull
      Deadlift
        "1x5 @ 120kg"
      Rows
    Legs
      Squat
        progress: 70
  Cardio
    Zone 2
      "45 min, keep HR under 140"
    Intervals
Nutrition
  Hydration
    "Target 2.5L per day"
  Protein
Recovery
  Sleep
    "7-8 hours, consistent schedule"
Metrics
  Weight
  Bloodwork
    due: 2026-12-01`,
  },
  {
    name: 'finance',
    displayName: 'Finance',
    description: 'Income and savings',
    structure: `Investments
  Retirement
    401k
      "Contribute up to the employer match first"
    Roth IRA
      progress: 35
  Brokerage
    Index Funds
      VTI
      VXUS
    Individual
  Emergency Fund
    progress: 80
    "Six months of expenses"
Fixed Costs
  Rent
  Utilities
  Insurance
  Subscriptions
Goals
  Pay Off Loan
    due: 2027-01-01
  House Down Payment
    progress: 20`,
  },
  {
    name: 'learning',
    displayName: 'Learning',
    description: 'Study and practice',
    structure: `Now
  Spanish
    progress: 45
    Grammar
      Subjunctive
        "Trickiest part — drill a little daily"
      Past Tenses
    Vocab
      Flashcards
    Speaking
      Weekly Tutor
        due: 2026-07-05
  Machine Learning
    Fundamentals
    Projects
Queue
  Systems Design
  Photography
Output
  Notes
  Blog Posts`,
  },
  {
    name: 'travel',
    displayName: 'Travel',
    description: 'Plan a trip',
    structure: `Japan Trip
  progress: 30
  Logistics
    Flights
      due: 2026-08-01
    Visa
    Insurance
  Itinerary
    Tokyo
      Day 1
        Shibuya
        Shinjuku
      Day 2
        Asakusa
        TeamLab
          "Tickets sell out — book weeks ahead"
    Kyoto
      Fushimi Inari
      Kinkaku-ji
    Osaka
      Dotonbori
  Budget
    "Target 3000 USD all-in"
Someday
  Patagonia
  Iceland`,
  },
  {
    name: 'home',
    displayName: 'Home',
    description: 'House upkeep',
    structure: `Maintenance
  Urgent
    Leaky Faucet
      "Call the plumber"
  Seasonal
    Spring
      Gutters
      Garden Beds
    Fall
      Winterize Pipes
      Furnace Service
        due: 2026-10-15
Rooms
  Garage
    Declutter
    Shelving
  Kitchen
Purchases
  Vacuum
  Couch`,
  },
  {
    name: 'relationships',
    displayName: 'Relationships',
    description: 'People to nurture',
    structure: `Family
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
    "Reconnect — it's been almost a year"
  Birthdays
  Thank Yous
Professional
  Mentors
  Peers`,
  },
  {
    name: 'goals',
    displayName: 'Goals',
    description: 'Vision to quarter',
    structure: `Vision
  Five Year
    "Lead a team, run a half marathon, own a home"
This Year
  Career
    progress: 25
    Get Promoted
      due: 2026-12-31
    Give a Talk
  Health
    progress: 40
    Half Marathon
      "Race day: Oct 18"
  Financial
    progress: 60
Quarter
  Q3 Focus
    due: 2026-09-30
Review
  Weekly
  Monthly`,
  },
  {
    name: 'routine',
    displayName: 'Daily Routine',
    description: 'Day in blocks',
    structure: `Morning
  Wake 6am
  Workout
    "Alternate run and lift days"
  Plan Day
    Top 3 Tasks
Midday
  Lunch
  Deep Work
    "Phone in another room"
Evening
  Cook
  Family Time
Night
  Wind Down
    Read
      "30 min, no screens"
    Journal
  Sleep by 11pm
Weekend
  Meal Prep
  Long Walk`,
  },
  {
    name: 'meals',
    displayName: 'Meals',
    description: 'Recipes and groceries',
    structure: `Recipes
  Weeknight
    Stir Fry
      Ingredients
        Tofu
        Bok Choy
        Garlic Ginger Sauce
      "20 minutes, one pan"
    Pasta Primavera
  To Try
    Thai Green Curry
    Shakshuka
Groceries
  Produce
  Pantry
  Proteins
Prep
  Batch Cook
    "Sundays — grains and roast veg"
  Freezer Meals
Breakfast
  Oatmeal
  Eggs`,
  },
  {
    name: 'hobbies',
    displayName: 'Hobbies',
    description: 'Crafts and pastimes',
    structure: `Guitar
  progress: 50
  Technique
    Barre Chords
      "Still buzzing on the B string"
    Fingerpicking
  Songs
    Learning
      Blackbird
      Wish You Were Here
    Mastered
Photography
  Gear
    Camera
    Lenses
  Editing
Woodworking
  Bookshelf
    progress: 30
Reading
  Sci-Fi`,
  },
  {
    name: 'watchlist',
    displayName: 'Watchlist',
    description: 'What to watch',
    structure: `Movies
  To Watch
    Dune Part Two
    Oppenheimer
      "Recommended by Sam"
  Watched
    Favorites
      Arrival
Shows
  Watching
    Severance
      progress: 40
  Queue
    The Bear
  Finished
Games
  Playing
    Elden Ring
      progress: 65
  Backlog
Documentaries
  Planet Earth`,
  },
]
