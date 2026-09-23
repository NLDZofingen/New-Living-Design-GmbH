import { ImageResponse } from '@vercel/og';
import React from 'react';

export const config = {
  runtime: 'edge',
};

export default function handler(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    // ?title=<title>
    const hasTitle = searchParams.has('title');
    const title = hasTitle
      ? searchParams.get('title')?.slice(0, 100)
      : 'New Living Design GmbH';

    return new ImageResponse(
      React.createElement(
        'div',
        {
          style: {
            backgroundColor: 'white',
            backgroundSize: '150px 150px',
            height: '100%',
            width: '100%',
            display: 'flex',
            textAlign: 'center',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            flexWrap: 'nowrap',
          },
        },
        React.createElement(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              justifyItems: 'center',
            },
          },
          React.createElement('img', {
            alt: 'New Living Design Logo',
            height: 200,
            src: "data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='100' height='100' fill='%23007acc'/%3E%3Ctext x='50' y='50' font-family='Arial' font-size='20' fill='white' text-anchor='middle' dy='.3em'%3ENLD%3C/text%3E%3C/svg%3E",
            style: { margin: '0 30px' },
            width: 200,
          })
        ),
        React.createElement(
          'div',
          {
            style: {
              fontSize: 60,
              fontStyle: 'normal',
              letterSpacing: '-0.025em',
              color: 'black',
              marginTop: 30,
              padding: '0 120px',
              lineHeight: 1.4,
              whiteSpace: 'pre-wrap',
            },
          },
          title
        )
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (e) {
    console.log(`${(e as { message?: string }).message}`);
    return new Response(`Failed to generate the image`, {
      status: 500,
    });
  }
}
