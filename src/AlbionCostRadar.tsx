import { formatTokens, formatUsd, getLifetimeStatus } from './albionFreeTier';
import { useAlbionCaps } from './albionCapsStore';

interface Props {
	predictedModel: string;
	estimatedTokens: number;
	isFreeTier: boolean;
	priceFormatted: string;
}

export function AlbionCostRadar({ predictedModel, estimatedTokens, isFreeTier, priceFormatted }: Props) {
	const caps = useAlbionCaps();
	const lifetime = isFreeTier ? getLifetimeStatus(caps.data) : null;

	const text = lifetime
		? lifetime.locked
			? `Lifetime limit reached · ${formatTokens(lifetime.used)}/${formatTokens(lifetime.cap)} tokens · Upgrade required`
			: `Auto: ${predictedModel} · ≈ ${estimatedTokens.toLocaleString()} tokens · ${formatTokens(lifetime.remaining)} left of ${formatTokens(lifetime.cap)} · Session ${formatUsd(lifetime.costUsd)}`
		: `Auto: ${predictedModel} · ≈ ${estimatedTokens.toLocaleString()} tokens · ${priceFormatted}`;

	return (
		<div
			className="ref-cost-radar"
			data-testid="cost-radar"
			style={{
				fontSize: '11px',
				lineHeight: '16px',
				color: lifetime?.locked
					? '#F87171'
					: lifetime?.warning
						? '#F59E0B'
						: 'var(--text-subtle, rgba(255, 255, 255, 0.45))',
				padding: '6px 12px 2px 12px',
				userSelect: 'none',
				whiteSpace: 'nowrap',
				overflow: 'hidden',
				textOverflow: 'ellipsis',
				letterSpacing: '0.01em',
			}}
		>
			{text}
		</div>
	);
}
