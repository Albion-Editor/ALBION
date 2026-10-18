import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { BrandLogo } from './BrandLogo';
import type { TFunction } from './i18n';

const REPO_URL = 'https://github.com/albion-dev/albion';

type VersionInfo = {
	version: string;
	electron: string;
	chrome: string;
	node: string;
};

type Props = {
	open: boolean;
	t: TFunction;
	shell: Window['asyncShell'] | undefined;
	onClose: () => void;
};

export function AboutDialog({ open, t, shell, onClose }: Props) {
	const [info, setInfo] = useState<VersionInfo | null>(null);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!open) return;
		setCopied(false);
		if (!shell) {
			setInfo({ version: '', electron: '', chrome: '', node: '' });
			return;
		}
		let cancelled = false;
		void shell
			.invoke('app:getVersion')
			.then((r) => {
				if (cancelled) return;
				const o = (r ?? {}) as Partial<VersionInfo>;
				setInfo({
					version: o.version ?? '',
					electron: o.electron ?? '',
					chrome: o.chrome ?? '',
					node: o.node ?? '',
				});
			})
			.catch(() => {
				if (cancelled) return;
				setInfo({ version: '', electron: '', chrome: '', node: '' });
			});
		return () => {
			cancelled = true;
		};
	}, [open, shell]);

	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				onClose();
			}
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, [open, onClose]);

	if (!open) return null;

	const versionLabel = t('app.help.aboutVersion').replace('{version}', info?.version || '—');

	const openRepo = () => {
		if (shell) {
			void shell.invoke('shell:openExternalUrl', REPO_URL).catch(() => {});
		} else {
			window.open(REPO_URL, '_blank', 'noopener,noreferrer');
		}
	};

	const copyInfo = () => {
		const lines = [
			'Albion IDE',
			versionLabel,
			info?.electron ? `Electron ${info.electron}` : '',
			info?.chrome ? `Chromium ${info.chrome}` : '',
			info?.node ? `Node.js ${info.node}` : '',
			REPO_URL,
		].filter(Boolean);
		const text = lines.join('\n');
		void navigator.clipboard
			.writeText(text)
			.then(() => {
				setCopied(true);
				window.setTimeout(() => setCopied(false), 1600);
			})
			.catch(() => {});
	};

	return createPortal(
		<div
			className="ws-modal-backdrop ws-about-backdrop"
			role="presentation"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div
				className="ws-modal ws-about-modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="ws-about-title"
			>
				<div className="ws-about-hero">
					<div className="ws-about-hero-glow" aria-hidden />
					<BrandLogo className="ws-about-logo" size={56} aria-label="Albion" />
					<h2 id="ws-about-title" className="ws-about-title">
						Albion
					</h2>
					<p className="ws-about-tagline">{t('app.help.aboutTagline')}</p>
					<div className="ws-about-version-pill">{versionLabel}</div>
				</div>
				<div className="ws-about-meta">
					<div className="ws-about-meta-row">
						<span className="ws-about-meta-key">Electron</span>
						<span className="ws-about-meta-val">{info?.electron || '—'}</span>
					</div>
					<div className="ws-about-meta-row">
						<span className="ws-about-meta-key">Chromium</span>
						<span className="ws-about-meta-val">{info?.chrome || '—'}</span>
					</div>
					<div className="ws-about-meta-row">
						<span className="ws-about-meta-key">Node.js</span>
						<span className="ws-about-meta-val">{info?.node || '—'}</span>
					</div>
				</div>
				<div className="ws-about-actions">
					<button type="button" className="ws-about-btn ws-about-btn--ghost" onClick={openRepo}>
						{t('app.help.aboutOpenRepo')}
					</button>
					<button type="button" className="ws-about-btn ws-about-btn--ghost" onClick={copyInfo}>
						{copied ? t('app.help.aboutCopied') : t('app.help.aboutCopyInfo')}
					</button>
					<button type="button" className="ws-about-btn ws-about-btn--primary" onClick={onClose} autoFocus>
						{t('app.help.aboutClose')}
					</button>
				</div>
				<div className="ws-about-footer">{t('app.help.aboutCopyright')}</div>
			</div>
		</div>,
		document.body
	);
}
