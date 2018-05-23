import React from 'react';

const LogEntry = ({ buyCoin, tradeRes }) => {
  const { sale, purchase, savings } = tradeRes;

  return (
    <li>
      You saved <span className="bold">${savings.USDSavings}</span> per share, or{' '}
      <span className="bold">${savings.totalUSDSavings}</span> on the{' '}
      <span className="bold">{purchase.quantity}</span> shares of{' '}
      <span className="bold">{buyCoin.name}</span> purchased by using{' '}
      <span className="bold">{savings.bestBaseCoin}</span> instead of{' '}
      <span className="bold">{savings.worstBaseCoin}!</span>
    </li>
  );
};

export default LogEntry;
