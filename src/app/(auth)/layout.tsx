export default function AuthLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex min-h-dvh w-full flex-col">
			<main className="flex flex-1 flex-col items-center justify-center px-4">{children}</main>
		</div>
	);
}
