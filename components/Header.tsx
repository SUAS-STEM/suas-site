"use client";

import Link from "next/link";
import React, { useState, useEffect } from "react";
import Image from "next/image";

export default function Navbar(): React.ReactElement {
	const [isMobile, setIsMobile] = useState(false);
	const [isMenuOpen, setIsMenuOpen] = useState(false);

	useEffect(() => {
		const checkMobile = () => {
			setIsMobile(window.innerWidth < 900);
		};
		checkMobile();
		window.addEventListener('resize', checkMobile);
		return () => window.removeEventListener('resize', checkMobile);
	}, []);

	const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

	return (
		<nav className="w-full border-b border-gray-800 h-30 flex items-center font-sans relative">
			<div className="max-w-6xl mx-auto px-4">
				{isMobile ? (
					// Mobile header
					<div className="flex items-center justify-between">
						{/* Logo */}
						<div className="flex justify-start">
							<Link href="/" className="text-xl font-bold tracking-tight">
								<img src="/logo.png" alt="SUAS Logo" width={150} height={68} />
							</Link>
						</div>
						{/* Hamburger menu */}
						<button
							onClick={toggleMenu}
							className="text-white focus:outline-none"
							aria-label="Toggle menu"
						>
							<div className="w-12 h-6 flex flex-col justify-center items-center">
								<span className={`block w-5 h-0.5 bg-white transition-transform duration-300 ${isMenuOpen ? 'rotate-45 translate-y-0.5' : '-translate-y-1'}`}></span>
								<span className={`block w-5 h-0.5 bg-white transition-opacity duration-300 ${isMenuOpen ? 'opacity-0' : 'opacity-100'}`}></span>
								<span className={`block w-5 h-0.5 bg-white transition-transform duration-300 ${isMenuOpen ? '-rotate-45 -translate-y-0.5' : 'translate-y-1'}`}></span>
							</div>
						</button>
					</div>
				) : (
					// Desktop header
					<div className="grid grid-cols-3 items-center py-4">
						{/* Left links */}
						<div className="flex gap-24 items-center justify-start">
							<Link href="/team" className="text-md font-medium hover:underline">
								Team
							</Link>
							<Link href="/gallery" className="text-md font-medium hover:underline">
								Gallery
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
							<Link href="/aircraft" className="text-md font-medium hover:underline">
								Aircraft
							</Link>
							<Link href="/sponsor" className="text-md font-medium hover:underline">
								Sponsor
							</Link>
						</div>
					</div>
				)}

				{/* Mobile menu */}
				{isMobile && isMenuOpen && (
					<div className="absolute top-full left-0 w-full bg-black border-b border-gray-800 py-4 px-4 z-50">
						<div className="flex flex-col gap-4">
							<Link href="/" className="text-md font-medium hover:underline" onClick={() => setIsMenuOpen(false)}>
								Home
							</Link>
							<Link href="/team" className="text-md font-medium hover:underline" onClick={() => setIsMenuOpen(false)}>
								Team
							</Link>
							<Link href="/gallery" className="text-md font-medium hover:underline" onClick={() => setIsMenuOpen(false)}>
								Gallery
							</Link>
							<Link href="/aircraft" className="text-md font-medium hover:underline" onClick={() => setIsMenuOpen(false)}>
								Aircraft
							</Link>
							<Link href="/sponsor" className="text-md font-medium hover:underline" onClick={() => setIsMenuOpen(false)}>
								Sponsor
							</Link>
						</div>
					</div>
				)}
			</div>
		</nav>
	);
}
