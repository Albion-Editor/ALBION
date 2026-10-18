import { memo } from 'react';
import '../styles/editor-layout.css';
import { BrandLogo } from '../BrandLogo';
import { IconExplorer, IconCloudOutline, IconServerOutline } from '../icons';
import type { TFunction } from '../i18n';

function workspacePathDisplayName(full: string): string {
	const norm = full.replace(/\\/g, '/');
	const parts = norm.split('/').filter(Boolean);
	return parts[parts.length - 1] ?? full;
}

function workspacePathParent(full: string): string {
	const norm = full.replace(/\\/g, '/');
	const i = norm.lastIndexOf('/');
	if (i <= 0) {
		return '';
	}
	return norm.slice(0, i);
}

export type AppWorkspaceWelcomeProps = {
	t: TFunction;
	homeRecents: string[];
	onOpenWorkspacePicker: () => void;
	onOpenWorkspacePath: (path: string) => void;
};

/** 未打开工作区时的欢迎页（Agent / Editor 共用），独立 memo 避免主壳其它状态更新时整页 reconcile */
export const AppWorkspaceWelcome = memo(function AppWorkspaceWelcome({
	t,
	homeRecents,
	onOpenWorkspacePicker,
	onOpenWorkspacePath,
}: AppWorkspaceWelcomeProps) {
	return (
		<div className="ref-body ref-body--editor-home" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
			<main className="ref-editor-welcome" aria-label={t('app.editorWelcomeAria')}>
				<div className="ref-editor-welcome-inner">
					<section className="ref-editor-launchpad">
						<div className="ref-editor-welcome-brand">
							<BrandLogo className="ref-editor-welcome-logo" size={62} />
							<div className="ref-editor-welcome-brand-text">
								<span className="ref-editor-welcome-wordmark">Albion</span>
								<span className="ref-editor-welcome-tagline">AI-Native IDE · Predictable Costs · Verified Code</span>
							</div>
						</div>
						<div
							className="ref-editor-welcome-actions"
							role="group"
							aria-label={t('app.editorWelcomeActionsAria')}
						>
							<button type="button" className="ref-welcome-action-card ref-welcome-action-card--primary" onClick={onOpenWorkspacePicker}>
								<span className="ref-welcome-action-icon" aria-hidden>
									<IconExplorer />
								</span>
								<span className="ref-welcome-action-copy">
									<span className="ref-welcome-action-label">{t('app.welcomeOpenProject')}</span>
									<span className="ref-welcome-action-subtitle">{t('app.welcomeOpenProjectHint')}</span>
								</span>
							</button>
							<button type="button" className="ref-welcome-action-card ref-welcome-action-card--soon" disabled title={t('app.comingSoon')}>
								<span className="ref-welcome-action-icon" aria-hidden>
									<IconCloudOutline />
								</span>
								<span className="ref-welcome-action-copy">
									<span className="ref-welcome-action-label">{t('app.welcomeCloneRepo')}</span>
									<span className="ref-welcome-action-subtitle">{t('app.welcomeCloneRepoHint')}</span>
								</span>
							</button>
							<button type="button" className="ref-welcome-action-card ref-welcome-action-card--soon" disabled title={t('app.comingSoon')}>
								<span className="ref-welcome-action-icon" aria-hidden>
									<IconServerOutline />
								</span>
								<span className="ref-welcome-action-copy">
									<span className="ref-welcome-action-label">{t('app.welcomeConnectSsh')}</span>
									<span className="ref-welcome-action-subtitle">{t('app.welcomeConnectSshHint')}</span>
								</span>
							</button>
						</div>
					</section>
					<section
						className="ref-editor-welcome-recents ref-editor-welcome-panel"
						aria-labelledby="ref-welcome-recents-title"
					>
						<div className="ref-editor-welcome-recents-head">
							<h2 id="ref-welcome-recents-title" className="ref-editor-welcome-recents-title">
								{t('app.recentProjects')}
							</h2>
							<button type="button" className="ref-welcome-view-all" onClick={onOpenWorkspacePicker}>
								{t('app.viewAllRecents', { count: String(homeRecents.length) })}
							</button>
						</div>
						{homeRecents.length === 0 ? (
							<p className="ref-editor-welcome-recents-empty muted">{t('app.noRecentsYet')}</p>
						) : (
							<div className="ref-editor-welcome-recents-list" role="list">
								{homeRecents.slice(0, 6).map((p) => (
									<button
										key={p}
										type="button"
										className="ref-welcome-recent-card"
										role="listitem"
										title={p}
										onClick={() => void onOpenWorkspacePath(p)}
									>
										<span className="ref-welcome-recent-card-icon" aria-hidden>
											<IconExplorer />
										</span>
										<span className="ref-welcome-recent-card-copy">
											<span className="ref-welcome-recent-card-name">{workspacePathDisplayName(p)}</span>
											<span className="ref-welcome-recent-card-path muted">{workspacePathParent(p) || '—'}</span>
										</span>
									</button>
								))}
							</div>
						)}
					</section>
				</div>
			</main>
		</div>
	);
});
