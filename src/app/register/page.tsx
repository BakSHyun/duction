import AuthForm from "@/components/AuthForm";

export const metadata = { title: "회원가입" };

export default function RegisterPage() {
  return <AuthForm mode="register" />;
}
