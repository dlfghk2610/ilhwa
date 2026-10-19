ALTER TABLE public.bid_participations ADD COLUMN participation_type text;
ALTER TABLE public.bid_participations ADD CONSTRAINT bid_participation_type_valid CHECK (participation_type IN ('대표참여', '도급참여'));
COMMENT ON COLUMN public.bid_participations.participation_type IS '입찰 참여 구분. NULL은 미분류이며 기존 상태와 독립적으로 유지됩니다.';