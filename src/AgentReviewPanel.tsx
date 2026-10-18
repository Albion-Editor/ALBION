import { useMemo, useState } from 'react';
import { AgentDiffCard } from './AgentDiffCard';
import { TrustBadge } from './TrustBadge';
import type { AgentPendingPatch } from './ipcTypes';
import { useI18n } from './i18n';

type Props = {
	patches: AgentPendingPatch[];
	workspaceRoot: string | null;
	busy: boolean;
	onOpenFile: (
		rel: string,
		revealLine?: number,
		revealEndLine?: number,
		options?: { diff?: string | null }
	) => void;
	onApplyOne: (id: string) => void;
	onApplyAll: () => void;
	onDiscard: () => void;
};

function IconChevron({ expanded, className }: { expanded: boolean; className?: string }) {
	return (
		<svg
			className={className}
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden
		>
			{expanded ? <path d="M18 15l-6-6-6 6" /> : <path d="M6 9l6 6 6-6" />}
		</svg>
	);
}

export function AgentReviewPanel({
	patches,
	workspaceRoot,
	busy,
	onOpenFile,
	onApplyOne,
	onApplyAll,
	onDiscard,
}: Props) {
	const { t } = useI18n();
	const [expanded, setExpanded] = useState(true);
	const fileCount = useMemo(() => {
		const s = new Set<string>();
		for (const p of patches) {
			s.add(p.relPath?.trim() || p.id);
		}
		return s.size;
	}, [patches]);

	if (patches.length === 0) {
		return null;
	}

	return (
		<div className="ref-agent-review" role="region" aria-label={t('agent.review.regionAria')}>
			<div className="ref-agent-review-bar">
				<div className="ref-agent-review-bar-left">
					<span className="ref-agent-review-title">{t('agent.review.title')}</span>
					<span className="ref-agent-review-meta">
						{t('agent.review.meta', { patches: patches.length, paths: fileCount })}
					</span>
				</div>
				<div className="ref-agent-review-bar-right">
					<button
						type="button"
						className="ref-agent-review-btn ref-agent-review-btn--ghost"
						disabled={busy}
						onClick={onDiscard}
					>
						{t('agent.review.discardAll')}
					</button>
					<button
						type="button"
						className="ref-agent-review-btn ref-agent-review-btn--primary"
						disabled={busy}
						onClick={onApplyAll}
					>
						{t('agent.review.applyAll')}
					</button>
					<button
						type="button"
						className="ref-agent-review-toggle"
						disabled={busy}
						aria-expanded={expanded}
						onClick={() => setExpanded((e) => !e)}
					>
						<span>{expanded ? t('agent.review.collapse') : t('agent.review.expand')}</span>
						<IconChevron expanded={expanded} className="ref-agent-review-toggle-ico" />
					</button>
				</div>
			</div>
			{expanded ? (
				<div className="ref-agent-review-body">
					{patches.map((p) => (
						<div key={p.id} className="ref-agent-review-row">
							<div className="ref-agent-review-row-head">
								<span className="ref-agent-review-row-label" title={p.relPath ?? undefined}>
									{p.relPath ?? t('agent.review.unknownPath')}
								</span>
								<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
									<TrustBadge verification={p.verification} />
									<button
										type="button"
										className="ref-agent-review-btn ref-agent-review-btn--sm"
										disabled={busy}
										onClick={() => onApplyOne(p.id)}
									>
										{t('agent.review.applyOne')}
									</button>
								</div>
							</div>
							<AgentDiffCard
								diff={p.chunk}
								workspaceRoot={workspaceRoot}
								verification={p.verification}
								onOpenFile={onOpenFile}
							/>
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}
