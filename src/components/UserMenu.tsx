import { LogOut } from 'lucide-react';
import type { MemberProfile } from '@/types/member';

interface UserMenuProps {
  member: MemberProfile;
  onSignOut: () => void;
}

export default function UserMenu({ member, onSignOut }: UserMenuProps) {
  const name = member.display_name;
  return (
    <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2 sm:pr-3">
      {member.avatar_url ? (
        <img src={member.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
      ) : (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-800">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="max-w-[8rem] truncate text-sm font-medium text-slate-800">{name}</span>
      <button
        type="button"
        onClick={onSignOut}
        aria-label="로그아웃"
        title="로그아웃"
        className="flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition duration-150 hover:bg-slate-100 hover:text-slate-900"
      >
        <LogOut className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
