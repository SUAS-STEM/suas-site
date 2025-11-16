import Link from "next/link";
import React from "react";
import Image from "next/image";
export default function Navbar(): React.ReactElement {
	return (
		<nav className="w-full border-b border-gray-800 h-40 flex items-center">
			<div className="max-w-6xl mx-auto px-4">
				<div className="grid grid-cols-3 items-center py-4">
					{/* Left links */}
					<div className="flex gap-24 items-center justify-start">
						<Link href="/" className="text-md font-medium hover:underline">
							Home
						</Link>
						<Link href="/team" className="text-md font-medium hover:underline">
							Team
						</Link>
					</div>

					{/* Center logo */}
					<div className="flex justify-center mx-5">
						<Link href="/" className="text-xl font-bold tracking-tight">
							<img src="/logo.png" alt="SUAS Logo" width={200} height={90} />
						</Link>
					</div>

					{/* Right links */}
					<div className="flex gap-24 items-center justify-end">
						<Link href="/sponsor" className="text-md font-medium hover:underline">
							Sponsor
						</Link>
						<Link href="/gallery" className="text-md font-medium hover:underline">
							Gallery
						</Link>
					</div>
				</div>
			</div>
		</nav>
	);
}
