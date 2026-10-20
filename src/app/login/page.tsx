import { LoginPage } from "@/features/auth/components/LoginPage"

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
    return <LoginPage nextPath={(await searchParams).next} />
}
