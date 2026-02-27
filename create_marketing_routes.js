const fs = require('fs');
const path = require('path');

// 1. Scaffold Missing Routes
const routes = [
    '/solutions/small-clinics',
    '/solutions/mid-size-hospitals',
    '/solutions/enterprise',
    '/features/smart-tv',
    '/features/analytics',
    '/features/omnichannel',
    '/compare/qless',
    '/compare/waitwhile',
    '/compare/virtuaq',
    '/roi-calculator',
    '/about',
    '/contact',
    '/blog',
    '/resources/case-studies',
    '/legal/privacy-policy',
    '/legal/terms-of-service',
    '/legal/dpdp',
    '/legal/hipaa'
];

const basePath = 'c:\\Users\\ASUS\\OneDrive\\Desktop\\qless\\app\\(marketing)';

routes.forEach(route => {
    const dir = path.join(basePath, route.replace(/\//g, '\\'));
    fs.mkdirSync(dir, { recursive: true });

    // Capitalize and format name
    const parts = route.split('/');
    const basename = parts[parts.length - 1];
    const name = basename.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
    const title = basename.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    const content = `import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ${name}Page() {
    return (
        <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-slate-900 dark:text-white mb-6">
                ${title}
            </h1>
            <p className="text-xl text-slate-600 dark:text-slate-400 max-w-2xl mb-10">
                This page is part of the QLink marketing architecture. Detailed content for the ${title} use-case applies here.
            </p>
            <div className="flex gap-4 items-center justify-center">
                <Link href="/pricing"><Button variant="outline" size="lg">View Pricing</Button></Link>
                <Link href="/login"><Button size="lg" className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full">Start Free Trial</Button></Link>
            </div>
        </div>
    );
}
`;
    fs.writeFileSync(path.join(dir, 'page.tsx'), content);
});
console.log('Scaffolded all missing 18 routes.');

// 2. Clean up duplicate Headers/Footers since we added layout.tsx, and update prices
const filesToClean = [
    'page.tsx',
    'pricing/page.tsx',
    'whatsapp/page.tsx',
    'compare/qmatic/page.tsx'
];

filesToClean.forEach(file => {
    const fullPath = path.join(basePath, file.replace(/\//g, '\\'));
    if (!fs.existsSync(fullPath)) return;

    let content = fs.readFileSync(fullPath, 'utf8');

    // Remove the Global <nav> elements (non-greedy)
    content = content.replace(/<nav[\s\S]*?<\/nav>/, '');

    // Remove the Global <footer> elements (non-greedy)
    content = content.replace(/<footer[\s\S]*?<\/footer>/, '');

    // Apply the User's explicitly requested pricing configuration
    content = content.replace(/₹1,499/g, '₹1,999');
    content = content.replace(/₹3,999/g, '₹4,999');

    fs.writeFileSync(fullPath, content);
    console.log('Cleaned and dynamically updated pricing for:', file);
});

console.log('Job completed successfully!');
