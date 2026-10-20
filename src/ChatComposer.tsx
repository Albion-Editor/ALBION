import {
	type Dispatch,
	type KeyboardEvent,
	type RefObject,
	type SetStateAction,
	useContext,
	useEffect,
	useMemo,
	useState,
} from 'react';
import { ComposerGitBranchRow, type ComposerContextMeterState } from './ComposerGitBranchRow';
import { ComposerActionsContext } from './ComposerActionsContext';
import { ComposerModeIcon, composerModeLabel, type ComposerMode } from './ComposerPlusMenu';
import { ComposerRichInput } from './ComposerRichInput';
import { type ComposerSegment, type PersistedComposerAttachment } from './composerSegments';
import { fetchAlbionPricing, getCachedAlbionPricing, type ModelPricingItem } from './albionPricing';
import { useI18n } from './i18n';
import { useAlbionAuth } from './albionAuthStore';
import {
	IconArrowUp,
	IconChevron,
	IconImageOutline,
	IconStop,
} from './icons';
import { type AtComposerSlot } from './useComposerAtMention';

export type ComposerAnchorSlot = 'hero' | 'bottom' | 'inline';

type ComposerRef = RefObject<HTMLDivElement | null>;

interface ChatComposerProps {
	slot: ComposerAnchorSlot;
	variant?: 'stacked' | 'editor-hero';
	segments: ComposerSegment[];
	setSegments: Dispatch<SetStateAction<ComposerSegment[]>>;
	canSend: boolean;
	extraClass?: string;
	showGitBranchRow?: boolean;
	/** 当前模型在设置中配置了上下文窗口时显示 Git 行左侧圆环 */
	composerContextMeter?: ComposerContextMeterState | null;
	composerRichHeroRef: ComposerRef;
	composerRichBottomRef: ComposerRef;
	composerRichInlineRef: ComposerRef;
	plusAnchorHeroRef: ComposerRef;
	plusAnchorBottomRef: ComposerRef;
	plusAnchorInlineRef: ComposerRef;
	modelPillHeroRef: ComposerRef;
	modelPillBottomRef: ComposerRef;
	modelPillInlineRef: ComposerRef;
	composerMode: ComposerMode;
	hasConversation: boolean;
	composerPlaceholder: string;
	followUpComposerPlaceholder: string;
	plusMenuOpen: boolean;
	modelPickerOpen: boolean;
	modelPillLabel: string;
	awaitingReply: boolean;
	resendFromUserIndex: number | null;
	composerGitBranchAnchorRef: RefObject<HTMLButtonElement | null>;
	/** 打开 Git 分支菜单前关闭 + / 模型选择（稳定回调，避免 git 更新带动 composer props 失效） */
	onBeforeToggleGitBranchPicker?: () => void;
	setPlusMenuAnchorSlot: (slot: ComposerAnchorSlot) => void;
	setModelPickerOpen: Dispatch<SetStateAction<boolean>>;
	setPlusMenuOpen: Dispatch<SetStateAction<boolean>>;
	setModelPickerAnchorSlot: (slot: ComposerAnchorSlot) => void;
	/** 未传时尝试使用 ComposerActionsContext（App 根已提供） */
	onAbort?: () => void;
	onSend?: () => void;
	onNewThread?: () => void;
	onExplorerOpenFile?: (rel: string) => void;
	persistComposerAttachments: (files: File[]) => Promise<PersistedComposerAttachment[]>;
	syncComposerOverlays: (root: HTMLElement, slot: AtComposerSlot) => void;
	setResendFromUserIndex: Dispatch<SetStateAction<number | null>>;
	setInlineResendSegments: Dispatch<SetStateAction<ComposerSegment[]>>;
	skillInvokeKeyDown: (e: KeyboardEvent<HTMLDivElement>) => boolean;
	slashCommandKeyDown: (e: KeyboardEvent<HTMLDivElement>) => boolean;
	atMentionKeyDown: (e: KeyboardEvent<HTMLDivElement>) => boolean;
}

export function ChatComposer({
	slot,
	variant = 'stacked',
	segments,
	setSegments,
	canSend,
	extraClass,
	showGitBranchRow = true,
	composerContextMeter = null,
	composerRichHeroRef,
	composerRichBottomRef,
	composerRichInlineRef,
	plusAnchorHeroRef,
	plusAnchorBottomRef,
	plusAnchorInlineRef,
	modelPillHeroRef,
	modelPillBottomRef,
	modelPillInlineRef,
	composerMode,
	hasConversation,
	composerPlaceholder,
	followUpComposerPlaceholder,
	plusMenuOpen,
	modelPickerOpen,
	modelPillLabel,
	awaitingReply,
	resendFromUserIndex,
	composerGitBranchAnchorRef,
	onBeforeToggleGitBranchPicker,
	setPlusMenuAnchorSlot,
	setModelPickerOpen,
	setPlusMenuOpen,
	setModelPickerAnchorSlot,
	onAbort,
	onSend,
	onNewThread,
	onExplorerOpenFile,
	persistComposerAttachments,
	syncComposerOverlays,
	setResendFromUserIndex,
	setInlineResendSegments,
	skillInvokeKeyDown,
	slashCommandKeyDown,
	atMentionKeyDown,
}: ChatComposerProps) {
	const { t } = useI18n();
	const injected = useContext(ComposerActionsContext);
	const onSendFn = injected?.onSend ?? onSend;
	const onAbortFn = injected?.onAbort ?? onAbort;
	const onNewThreadFn = injected?.onNewThread ?? onNewThread;
	const onExplorerOpenFileFn = injected?.onExplorerOpenFile ?? onExplorerOpenFile;
	if (!onSendFn || !onAbortFn || !onNewThreadFn || !onExplorerOpenFileFn) {
		throw new Error('ChatComposer requires onSend/onAbort/onNewThread/onExplorerOpenFile or ComposerActionsProvider');
	}
	const isHero = variant === 'editor-hero';
	const richRef =
		slot === 'hero'
			? composerRichHeroRef
			: slot === 'bottom'
				? composerRichBottomRef
				: composerRichInlineRef;
	const plusRef =
		slot === 'hero'
			? plusAnchorHeroRef
			: slot === 'bottom'
				? plusAnchorBottomRef
				: plusAnchorInlineRef;
	const modelRef =
		slot === 'hero'
			? modelPillHeroRef
			: slot === 'bottom'
				? modelPillBottomRef
				: modelPillInlineRef;
	const isBottomSlot = slot === 'bottom';
	const [capExceededModalOpen, setCapExceededModalOpen] = useState(false);

	useEffect(() => {
		const handleCapExceeded = () => {
			setCapExceededModalOpen(true);
		};
		window.addEventListener('albion:cap-exceeded', handleCapExceeded);
		return () => {
			window.removeEventListener('albion:cap-exceeded', handleCapExceeded);
		};
	}, []);

	const showModelPicker = composerMode !== 'team';
	const inputPlaceholder =
		isBottomSlot && hasConversation ? followUpComposerPlaceholder : composerPlaceholder;
	const sendTitle = awaitingReply ? t('app.stopGeneration') : t('app.send');

	const onComposerKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
		if (skillInvokeKeyDown(e)) return;
		if (slashCommandKeyDown(e)) return;
		if (atMentionKeyDown(e)) return;
		if (e.key === 'Escape' && resendFromUserIndex !== null && slot === 'inline') {
			e.preventDefault();
			setResendFromUserIndex(null);
			setInlineResendSegments([]);
			return;
		}
		if (e.key === 'Tab' && e.shiftKey) {
			e.preventDefault();
			onNewThreadFn();
			return;
		}
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			onSendFn();
		}
	};

	const hasImageAttached = useMemo(() => {
		return segments.some(
			(s) =>
				s.kind === 'file' &&
				(Boolean(s.imageMeta) || /\.(png|jpe?g|webp|gif|svg|bmp)$/i.test(s.path))
		);
	}, [segments]);

	const albionAuth = useAlbionAuth();
	const userTier = (albionAuth.user?.tier || 'free').toLowerCase();
	const isFreeTier = userTier === 'free';

	const predictedModel = isFreeTier
		? 'openrouter-free'
		: hasImageAttached
			? 'qwen3.6-35b-a3b'
			: 'deepseek-v4-flash';

	const inputCharLength = useMemo(() => {
		let len = 0;
		for (const s of segments) {
			if (s.kind === 'text') len += s.text.length;
			else if (s.kind === 'command') len += String(s.command).length;
			else if (s.kind === 'skill') len += s.slug.length;
			else if (s.kind === 'file' && !s.imageMeta && !/\.(png|jpe?g|webp|gif|svg|bmp)$/i.test(s.path)) len += s.path.length;
		}
		return len;
	}, [segments]);

	const contextEstimate = composerContextMeter?.usedEstimate?.tokens ?? 0;
	const estimatedTokens = Math.round(inputCharLength / 4) + contextEstimate;

	const [pricingMap, setPricingMap] = useState<Record<string, ModelPricingItem> | null>(getCachedAlbionPricing());

	useEffect(() => {
		let isMounted = true;
		void fetchAlbionPricing().then((map) => {
			if (isMounted) setPricingMap(map);
		});
		return () => {
			isMounted = false;
		};
	}, []);

	const modelPricing = pricingMap?.[predictedModel];
	const costPer1k = modelPricing?.cost_per_1k ?? (predictedModel === 'qwen3.6-35b-a3b' ? 0.00025 : 0.00014);
	const calculatedCost = isFreeTier ? 0 : (estimatedTokens / 1000) * costPer1k;
	const priceFormatted = calculatedCost === 0 ? '$0.00' : `$${calculatedCost.toFixed(4)}`;

	const hasContent = segments.some((s) => (s.kind === 'text' && s.text?.trim()) || s.kind === 'file') || inputCharLength > 0;

	const capsule = (
		<div
			className={[
				'ref-capsule',
				isHero ? 'ref-capsule--editor-rail-hero' : 'ref-capsule--stacked-chat',
				extraClass,
			]
				.filter(Boolean)
				.join(' ')}
		>
			<div
				className="ref-cost-radar"
				data-testid="cost-radar"
				style={{
					fontSize: '11px',
					lineHeight: '16px',
					color: 'var(--text-subtle, rgba(255, 255, 255, 0.45))',
					padding: '6px 12px 2px 12px',
					userSelect: 'none',
					whiteSpace: 'nowrap',
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					letterSpacing: '0.01em',
				}}
			>
				{isFreeTier ? (
					<>Auto: {predictedModel} · Free Tier ($0.00) · ≈ {estimatedTokens.toLocaleString()} tokens (Unlimited)</>
				) : (
					<>Auto: {predictedModel} · ≈ {estimatedTokens.toLocaleString()} tokens · {priceFormatted}</>
				)}
			</div>
			<div className={isHero ? 'ref-composer-hero-body' : 'ref-composer-stacked-body'}>
				<ComposerRichInput
					innerRef={richRef}
					segments={segments}
					onSegmentsChange={setSegments}
					className={isHero ? 'ref-capsule-input' : 'ref-capsule-input ref-capsule-input--stacked-chat'}
					placeholder={inputPlaceholder}
					onFilePreview={(rel) => onExplorerOpenFileFn(rel)}
					onComposerAttachFiles={persistComposerAttachments}
					onRichInput={(root) => syncComposerOverlays(root, slot)}
					onRichSelect={(root) => syncComposerOverlays(root, slot)}
					onKeyDown={onComposerKeyDown}
				/>
			</div>
			<div className={isHero ? 'ref-capsule-bar ref-capsule-bar--editor-rail' : 'ref-capsule-bar ref-capsule-bar--stacked'}>
				<div className={isHero ? 'ref-editor-rail-bar-left' : 'ref-capsule-bar-start'}>
					<div className="ref-plus-anchor ref-editor-rail-mode-cluster" ref={plusRef}>
						<button
							type="button"
							className={`ref-mode-chip ref-mode-chip--${composerMode} ref-mode-chip--opens-menu is-active`}
							aria-expanded={plusMenuOpen}
							aria-haspopup="menu"
							title={t('app.addPlusTitle')}
							aria-label={t('app.addPlusAria')}
							onClick={() => {
								setPlusMenuAnchorSlot(slot);
								setModelPickerOpen(false);
								setPlusMenuOpen((open) => !open);
							}}
						>
							<ComposerModeIcon mode={composerMode} className="ref-mode-chip-ico" />
							<span className="ref-mode-chip-label">{composerModeLabel(composerMode, t)}</span>
							<IconChevron className="ref-mode-chip-menu-chev" />
						</button>
					</div>
					{showModelPicker ? (
						<div className="ref-model-pill-anchor" ref={modelRef}>
							<button
								type="button"
								className="ref-model-pill"
								aria-expanded={modelPickerOpen}
								aria-haspopup="listbox"
								onClick={() => {
									setModelPickerAnchorSlot(slot);
									setPlusMenuOpen(false);
									setModelPickerOpen((open) => !open);
								}}
							>
								<span className="ref-model-name">{modelPillLabel}</span>
								<IconChevron className="ref-model-chev" />
							</button>
						</div>
					) : null}
				</div>
				{isHero ? <div className="ref-capsule-bar-spacer" /> : null}
				<div className={isHero ? 'ref-editor-rail-bar-right' : 'ref-capsule-bar-end'}>
					{isHero ? (
						<button
							type="button"
							className="ref-mic-btn"
							title={t('app.attachMedia') || 'Attach Image'}
							aria-label="Attach Image"
							onClick={() => {
								const input = document.createElement('input');
								input.type = 'file';
								input.accept = 'image/*';
								input.onchange = (e) => {
									const files = Array.from((e.target as HTMLInputElement).files || []);
									if (files.length > 0) {
										void persistComposerAttachments(files).then((persisted) => {
											if (persisted.length > 0) {
												setSegments((prev) => [
													...prev,
													...persisted.map((p) => ({
														id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
														kind: 'file' as const,
														path: p.relPath,
														imageMeta: p.imageMeta,
													})),
												]);
											}
										});
									}
								};
								input.click();
							}}
						>
							<IconImageOutline className="ref-mic-btn-svg" />
						</button>
					) : null}
					<button
						type="button"
						className={`ref-send-btn ${awaitingReply ? 'is-stop' : ''}`}
						title={sendTitle}
						aria-label={sendTitle}
						disabled={!awaitingReply && !canSend && !hasContent}
						onClick={() => (awaitingReply ? onAbortFn() : onSendFn())}
					>
						{awaitingReply ? <IconStop className="ref-send-icon" /> : <IconArrowUp className="ref-send-icon" />}
					</button>
				</div>
			</div>
		</div>
	);

	const upgradeNudgeBanner = capExceededModalOpen ? (
		<div
			role="status"
			style={{
				margin: '0 0 8px 0',
				padding: '12px 14px',
				borderRadius: '10px',
				background: 'linear-gradient(135deg, rgba(245, 166, 35, 0.12), rgba(74, 144, 217, 0.12))',
				border: '1px solid rgba(245, 166, 35, 0.35)',
				display: 'flex',
				flexDirection: 'column',
				gap: '8px',
				fontSize: '12.5px',
				color: '#E2E8F0',
				boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
				<span style={{ fontSize: '15px', lineHeight: 1 }} aria-hidden="true">⚡</span>
				<strong style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: '#F8FAFC' }}>
					Daily free limit reached
				</strong>
				<button
					type="button"
					onClick={() => setCapExceededModalOpen(false)}
					style={{
						background: 'transparent',
						border: 'none',
						color: '#94A3B8',
						cursor: 'pointer',
						fontSize: '14px',
						lineHeight: 1,
						padding: '2px 4px',
					}}
					aria-label="Dismiss"
					title="Dismiss"
				>
					✕
				</button>
			</div>
			<p style={{ margin: 0, lineHeight: 1.5, color: '#CBD5E1' }}>
				You&apos;ve used all 50 free messages today. Upgrade to Starter ($8/mo) for unlimited fast requests,
				or wait until midnight (00:00 UTC) for your limit to reset.
			</p>
			<button
				type="button"
				onClick={() => {
					window.dispatchEvent(new CustomEvent('albion:open-settings', { detail: { nav: 'account' } }));
				}}
				style={{
					alignSelf: 'stretch',
					padding: '7px 12px',
					borderRadius: '6px',
					background: '#F5A623',
					color: '#0F172A',
					fontWeight: 600,
					fontSize: '12px',
					border: 'none',
					cursor: 'pointer',
				}}
			>
				Upgrade to Starter ($8/mo)
			</button>
		</div>
	) : null;

	if (slot !== 'bottom' || !showGitBranchRow) {
		return (
			<>
				{upgradeNudgeBanner}
				{capsule}
			</>
		);
	}

	return (
		<div className="ref-composer-stack-with-branch">
			{upgradeNudgeBanner}
			{capsule}
			<ComposerGitBranchRow
				ref={composerGitBranchAnchorRef}
				onBeforeToggleGitBranchPicker={onBeforeToggleGitBranchPicker}
				contextMeter={composerContextMeter}
			/>
		</div>
	);
}
