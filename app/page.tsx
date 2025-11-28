import Link from "next/link";
import { Button } from "@/components/ui/button";
import { 
  Receipt, 
  Users, 
  Calculator, 
  Plane, 
  Home as HomeIcon, 
  Utensils, 
  Building2, 
  CreditCard,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Globe
} from "lucide-react";

const features = [
  {
    icon: Calculator,
    title: "Smart Splitting",
    description: "Multiple split methods - equal, percentage, shares, or custom amounts",
  },
  {
    icon: Users,
    title: "Group Management",
    description: "Create groups for trips, roommates, events, or any shared expenses",
  },
  {
    icon: Receipt,
    title: "Expense Tracking",
    description: "Track who paid what and who owes whom with detailed breakdowns",
  },
  {
    icon: CreditCard,
    title: "Settlement Suggestions",
    description: "AI-powered minimal transaction recommendations to settle debts",
  },
];

const groupTypes = [
  { icon: Utensils, label: "Restaurant", color: "bg-orange-500" },
  { icon: Plane, label: "Trip", color: "bg-blue-500" },
  { icon: HomeIcon, label: "Flat/Roommates", color: "bg-green-500" },
  { icon: Building2, label: "Corporate", color: "bg-purple-500" },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
              <Receipt className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">SmartSplit</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <Link href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Features
            </Link>
            <Link href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              How it Works
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/auth">Log in</Link>
            </Button>
            <Button asChild>
              <Link href="/auth">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 md:py-32">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-medium">Smart expense splitting for everyone</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            Split expenses with friends,{" "}
            <span className="text-primary">the smart way</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Whether it&apos;s a dinner, a trip, or shared living costs, SmartSplit makes it easy to 
            track expenses and settle debts with minimal transactions.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="gap-2" asChild>
              <Link href="/auth">
                Start Splitting Free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/auth">I already have an account</Link>
            </Button>
          </div>
        </div>

        {/* Group type badges */}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-12">
          <span className="text-sm text-muted-foreground">Perfect for:</span>
          {groupTypes.map((type) => (
            <div
              key={type.label}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted"
            >
              <div className={`h-5 w-5 rounded-full ${type.color} flex items-center justify-center`}>
                <type.icon className="h-3 w-3 text-white" />
              </div>
              <span className="text-sm font-medium">{type.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="container mx-auto px-4 py-20 border-t">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">Everything you need to split expenses</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Powerful features designed to make expense sharing effortless and fair for everyone.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="p-6 rounded-2xl bg-card border hover:shadow-lg transition-shadow"
            >
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <feature.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="container mx-auto px-4 py-20 border-t">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">How SmartSplit works</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Get started in seconds and let us handle the math.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {[
            {
              step: "1",
              title: "Create a Group",
              description: "Set up a group for your trip, flat, or event. Invite friends via link or code.",
            },
            {
              step: "2",
              title: "Add Expenses",
              description: "Log expenses as they happen. Choose how to split - equally, by percentage, or custom.",
            },
            {
              step: "3",
              title: "Settle Up",
              description: "See who owes what. Get smart suggestions for minimum transactions to settle all debts.",
            },
          ].map((item) => (
            <div key={item.step} className="text-center">
              <div className="h-12 w-12 rounded-full bg-primary text-primary-foreground font-bold text-xl flex items-center justify-center mx-auto mb-4">
                {item.step}
              </div>
              <h3 className="font-semibold mb-2">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-3xl mx-auto text-center p-10 rounded-3xl bg-primary text-primary-foreground">
          <h2 className="text-3xl font-bold mb-4">Ready to simplify expense sharing?</h2>
          <p className="text-primary-foreground/80 mb-6">
            Join thousands of users who trust SmartSplit for fair and easy expense splitting.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 mb-8">
            {[
              "Free to use",
              "No credit card required",
              "Works on all devices",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm">{item}</span>
              </div>
            ))}
          </div>
          <Button size="lg" variant="secondary" className="gap-2" asChild>
            <Link href="/auth">
              Get Started Now
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-10">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 bg-primary rounded flex items-center justify-center">
                <Receipt className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-semibold">SmartSplit</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="#" className="hover:text-foreground transition-colors">Privacy</Link>
              <Link href="#" className="hover:text-foreground transition-colors">Terms</Link>
              <Link href="#" className="hover:text-foreground transition-colors">Contact</Link>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Globe className="h-4 w-4" />
              <span>Available worldwide</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
