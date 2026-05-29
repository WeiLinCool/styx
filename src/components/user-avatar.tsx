'use client';

import type { UserLevel } from '@/lib/cookie';

const DEFAULT_AVATARS = ['🪨', '🌸', '🌊', '🍃', '☀️'];

const LEVEL_CONFIG: Record<UserLevel, { label: string; bg: string; text: string }> = {
  free: { label: '', bg: '', text: '' },
  vip: { label: 'VIP', bg: '#1d1d1f', text: '#fff' },
  svip: { label: 'SVIP', bg: '#b45309', text: '#fff' },
  partner: { label: '合伙人', bg: '#1d1d1f', text: '#fff' },
  core_partner: { label: '核心', bg: '#b91c1c', text: '#fff' },
};

interface UserAvatarProps {
  avatar: string;
  size?: number;
  userLevel?: UserLevel;
  className?: string;
  onClick?: () => void;
}

export default function UserAvatar({ avatar, size = 28, userLevel = 'free', className = '', onClick }: UserAvatarProps) {
  const isUrl = avatar?.startsWith('data:') || avatar?.startsWith('http');
  const badge = LEVEL_CONFIG[userLevel];
  const badgeFontSize = Math.max(size * 0.28, 7);

  return (
    <div className={`relative inline-flex ${className}`} style={{ width: size, height: size }} onClick={onClick}>
      <div
        className="flex items-center justify-center overflow-hidden rounded-full bg-[#f5f5f7] border border-black/[0.06]"
        style={{ width: size, height: size, cursor: onClick ? 'pointer' : 'default' }}
      >
        {isUrl ? (
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        ) : (
          <span style={{ fontSize: Math.max(size * 0.5, 12) }}>
            {DEFAULT_AVATARS[parseInt(avatar) % 5] || '🪨'}
          </span>
        )}
      </div>
      {badge.label && (
        <span
          className="absolute -top-0.5 -right-1 rounded-full px-1 leading-none font-bold text-center whitespace-nowrap"
          style={{
            fontSize: badgeFontSize,
            backgroundColor: badge.bg,
            color: badge.text,
            minWidth: size * 0.55,
            padding: '1px 3px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }}
        >
          {badge.label}
        </span>
      )}
    </div>
  );
}
