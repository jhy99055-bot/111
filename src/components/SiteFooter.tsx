import { MessagesSquare } from 'lucide-react';
import { DISCORD_URL } from '@/lib/links';

export default function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:px-6">
        <span>© ROYALTY GAME. 모든 게임은 가상 칩으로 즐기는 오락입니다.</span>
        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 font-medium text-slate-700 transition duration-200 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700"
        >
          <MessagesSquare className="h-4 w-4" aria-hidden />
          디스코드 커뮤니티
        </a>
      </div>
    </footer>
  );
}
