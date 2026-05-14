import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { fileBase64, mimeType } = await req.json();
    if (!fileBase64 || !mimeType) {
      return new Response(JSON.stringify({ error: 'fileBase64 and mimeType required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const dataUrl = `data:${mimeType};base64,${fileBase64}`;

    const body = {
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: '당신은 한국 건설/엔지니어링 사업의 참여자명단 표를 추출하는 도우미입니다. 표 또는 문서에서 모든 참여자 행을 추출하세요. 날짜는 YYYY-MM-DD 형식으로 변환하세요.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: '이 문서에서 참여자명단 표를 추출해주세요. 모든 참여자(기술자) 행을 빠짐없이 반환하세요.' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'return_participants',
          description: '추출된 참여자 목록 반환',
          parameters: {
            type: 'object',
            properties: {
              participants: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: '성명' },
                    birth_date: { type: 'string', description: '생년월일 YYYY-MM-DD' },
                    period_start: { type: 'string', description: '참여시작일 YYYY-MM-DD' },
                    period_end: { type: 'string', description: '참여종료일 YYYY-MM-DD' },
                    specialty: { type: 'string', description: '전문분야' },
                    duties: { type: 'string', description: '담당업무' },
                    position: { type: 'string', description: '직위' },
                    responsibility: { type: 'string', description: '책임정도' },
                  },
                  required: ['name'],
                  additionalProperties: false,
                },
              },
            },
            required: ['participants'],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: 'function', function: { name: 'return_participants' } },
    };

    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error('AI gateway error:', resp.status, txt);
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: 'AI 크레딧이 부족합니다.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'AI 처리 실패' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await resp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall?.function?.arguments;
    let parsed: any = { participants: [] };
    if (args) {
      try { parsed = JSON.parse(args); } catch (e) { console.error('parse args fail', e); }
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('parse-participant-list error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
