# SmartSplit 💰

A comprehensive expense splitting application built with Next.js, Supabase, and ShadCN/UI. Perfect for splitting bills with friends, roommates, travel companions, or colleagues.

![SmartSplit](https://img.shields.io/badge/SmartSplit-Expense%20Splitting-blue)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)

## ✨ Features

### Core Features
- **Smart Expense Splitting** - Multiple split methods: equal, percentage, shares, or custom amounts
- **Group Management** - Create groups for trips, flats, events, subscriptions, and more
- **Real-time Updates** - Live sync across all devices using Supabase Realtime
- **Settlement Suggestions** - AI-powered minimal transaction recommendations
- **Multi-currency Support** - Track expenses in any currency

### Group Types
- 🍽️ **Restaurant** - Split dining bills
- ✈️ **Trip** - Track travel expenses
- 🏠 **Flat/Hostel** - Manage shared living costs
- 💼 **Corporate** - Business expense tracking with approvals
- 📅 **Events** - Party and event expenses
- 💳 **Subscriptions** - Shared subscription costs

### Authentication
- Email/Password login
- Google OAuth
- GitHub OAuth
- Password reset via email

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- pnpm (recommended) or npm
- Supabase account

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd expense
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   
   Create a `.env.local` file in the root directory:
   ```env
   # Supabase
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   
   # Optional: For server-side operations
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

4. **Set up the database**
   
   Run the SQL schema in your Supabase SQL Editor. See [Database Schema](#database-schema) below.

5. **Configure OAuth (Optional)**
   
   In your Supabase Dashboard:
   - Go to Authentication > Providers
   - Enable Google and/or GitHub
   - Add your OAuth credentials

6. **Run the development server**
   ```bash
   pnpm dev
   ```

7. **Open the app**
   
   Visit [http://localhost:3000](http://localhost:3000)

## 📁 Project Structure

```
expense/
├── app/                    # Next.js App Router pages
│   ├── (auth)/            # Auth group (future use)
│   ├── dashboard/         # Dashboard page
│   ├── groups/            # Group management pages
│   ├── login/             # Login page
│   ├── signup/            # Signup page
│   ├── forgot-password/   # Password reset
│   ├── reports/           # Analytics & reports
│   └── settings/          # User settings
├── components/            # React components
│   ├── ui/               # ShadCN UI components
│   ├── layout/           # Layout components
│   ├── groups/           # Group-related components
│   ├── expenses/         # Expense components
│   └── settlements/      # Settlement components
├── hooks/                # Custom React hooks
│   ├── use-user.ts      # User/auth state
│   ├── use-realtime.ts  # Supabase realtime
│   └── use-async.ts     # Async operations
├── lib/                  # Utility libraries
│   ├── supabase/        # Supabase client config
│   ├── actions/         # Server actions
│   └── split-engine.ts  # Core splitting logic
└── types/               # TypeScript types
```

## 🗄️ Database Schema

```sql
-- Profiles (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Groups
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL, -- restaurant, trip, flat, hostel, subscription, corporate, events
  currency TEXT DEFAULT 'USD',
  image_url TEXT,
  invite_code TEXT UNIQUE,
  settings JSONB DEFAULT '{}',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Group Members
CREATE TABLE group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member', -- admin, member
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

-- Expenses
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  paid_by UUID REFERENCES profiles(id),
  amount DECIMAL(12, 2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  description TEXT NOT NULL,
  category TEXT,
  date DATE DEFAULT CURRENT_DATE,
  split_type TEXT DEFAULT 'equal', -- equal, unequal, percentage, shares
  receipt_url TEXT,
  notes TEXT,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_pattern TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Expense Splits
CREATE TABLE expense_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL,
  percentage DECIMAL(5, 2),
  shares INTEGER,
  is_paid BOOLEAN DEFAULT FALSE,
  UNIQUE(expense_id, user_id)
);

-- Settlements
CREATE TABLE settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  from_user UUID REFERENCES profiles(id),
  to_user UUID REFERENCES profiles(id),
  amount DECIMAL(12, 2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'pending', -- pending, completed, cancelled
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;

-- Create policies (examples)
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can view groups they belong to"
  ON groups FOR SELECT
  USING (
    id IN (
      SELECT group_id FROM group_members WHERE user_id = auth.uid()
    )
  );
```

## 🔧 Smart Split Engine

The core splitting logic (`lib/split-engine.ts`) includes:

- **Equal Split** - Divides amount equally among all participants
- **Percentage Split** - Splits based on custom percentages
- **Shares Split** - Divides based on share ratios
- **Unequal Split** - Custom amounts per person
- **Debt Simplification** - Minimizes number of transactions needed to settle

```typescript
// Example usage
import { calculateSplit, simplifyDebts } from '@/lib/split-engine';

// Calculate equal split
const splits = calculateSplit(100, ['user1', 'user2', 'user3'], 'equal');

// Get minimal settlements
const settlements = simplifyDebts(expenses);
```

## 📱 Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/login` | User login |
| `/signup` | User registration |
| `/forgot-password` | Password reset |
| `/dashboard` | Main dashboard with overview |
| `/groups` | List of user's groups |
| `/groups/[id]` | Group detail with expenses & settlements |
| `/reports` | Analytics and spending reports |
| `/settings` | User settings and preferences |

## 🛠️ Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router)
- **Database**: [Supabase](https://supabase.com/) (PostgreSQL)
- **Authentication**: Supabase Auth
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Components**: [ShadCN/UI](https://ui.shadcn.com/)
- **Forms**: [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Notifications**: [Sonner](https://sonner.emilkowal.ski/)
- **Date Handling**: [date-fns](https://date-fns.org/)

## 🚢 Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import the project in [Vercel](https://vercel.com)
3. Add environment variables
4. Deploy!

### Other Platforms

The app can be deployed to any platform that supports Next.js:
- AWS Amplify
- Netlify
- Railway
- Docker

## 📄 License

MIT License - feel free to use this project for personal or commercial purposes.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

Built with ❤️ using Next.js and Supabase
