import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../hooks/useAuth';
import type { UserRole } from '../types';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

function homeForRole(role: UserRole): string {
  return role === 'Admin' ? '/admin' : '/';
}

export function Login() {
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    const bridge = (
      window as unknown as {
        AndroidSecure?: { setSecure: (secure: boolean) => void };
      }
    ).AndroidSecure;
    if (!bridge) return;
    bridge.setSecure(true);
    return () => bridge.setSecure(false);
  }, []);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  if (isAuthenticated && user) {
    return <Navigate to={homeForRole(user.role)} replace />;
  }

  const onSubmit = async (data: LoginForm) => {
    setServerError(null);
    try {
      const loggedInUser = await login(data.username, data.password);

      if (from && from !== '/login') {
        navigate(from, { replace: true });
      } else {
        navigate(homeForRole(loggedInUser.role), { replace: true });
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 via-white to-primary-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">अष्टविनायक युवक मंडळ</h1>
          <p className="mt-2 text-sm text-gray-500">Sign in to continue</p>
        </div>

        <Card padding="lg">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            {serverError && (
              <div
                className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
                role="alert"
              >
                {serverError}
              </div>
            )}

            <Input
              label="Username"
              type="text"
              autoComplete="username"
              placeholder="Enter your username"
              error={errors.username?.message}
              {...register('username')}
            />

            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              error={errors.password?.message}
              {...register('password')}
            />

            <Button
              type="submit"
              loading={isSubmitting}
              className="w-full"
              size="lg"
            >
              Sign in
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-xs leading-relaxed text-gray-400">
          By
          <br />
          <span className="font-medium text-gray-500">Gajendra Punekar</span>
        </p>
      </div>
    </div>
  );
}
