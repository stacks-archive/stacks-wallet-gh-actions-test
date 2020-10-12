import React, { FC, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { Spinner } from '@blockstack/ui';
import { useHotkeys } from 'react-hotkeys-hook';
import BigNumber from 'bignumber.js';

import { RootState } from '@store/index';
import { openInExplorer } from '@utils/external-links';
import { selectAddress } from '@store/keys';
import routes from '@constants/routes.json';
import { selectActiveNodeApi } from '@store/stacks-node';
import { selectAddressBalance } from '@store/address';
import {
  selectTransactionList,
  selectTransactionsLoading,
  selectTransactionListFetchError,
} from '@store/transaction';
import { selectPendingTransactions } from '@store/pending-transaction';
import { selectPoxInfo } from '@store/stacking';
import { homeActions, selectTxModalOpen, selectReceiveModalOpen } from '@store/home';
import { increment, decrement } from '@utils/mutate-numbers';
import {
  TransactionList,
  StackingPromoCard,
  StackingParticipationCard,
  StackingRewardCard,
  TransactionListItem,
  BalanceCard,
} from '@components/home';
import { TransactionModal } from '@modals/transaction/transaction-modal';
import { ReceiveStxModal } from '@modals/receive-stx/receive-stx-modal';
import { TransactionListItemPending } from '@components/home/transaction-list/transaction-list-item-pending';

import { Api } from '../../api/api';
import { HomeLayout } from './home-layout';

export const Home: FC = () => {
  const dispatch = useDispatch();
  const history = useHistory();
  const {
    address,
    balance,
    txs,
    pendingTxs,
    loadingTxs,
    txModalOpen,
    txListFetchError,
    receiveModalOpen,
    activeNode,
    stackingDetails,
  } = useSelector((state: RootState) => ({
    address: selectAddress(state),
    txs: selectTransactionList(state),
    pendingTxs: selectPendingTransactions(state),
    balance: selectAddressBalance(state),
    txModalOpen: selectTxModalOpen(state),
    receiveModalOpen: selectReceiveModalOpen(state),
    loadingTxs: selectTransactionsLoading(state),
    txListFetchError: selectTransactionListFetchError(state),
    activeNode: selectActiveNodeApi(state),
    stackingDetails: selectPoxInfo(state),
  }));

  const focusedTxIdRef = useRef<string | null>(null);
  const txDomNodeRefMap = useRef<Record<string, HTMLButtonElement>>({});

  const focusTxDomNode = useCallback(
    (shift: (i: number) => number) => {
      const allTxs = [...pendingTxs, ...txs];
      if (allTxs.length === 0) return;
      if (focusedTxIdRef.current === null) {
        const txId = allTxs[0].tx_id;
        focusedTxIdRef.current = txId;
        txDomNodeRefMap.current[txId].focus();
        return;
      }
      const nextIndex = shift(allTxs.findIndex(tx => tx.tx_id === focusedTxIdRef.current));
      const nextTx = allTxs[nextIndex];
      if (!nextTx) return;
      const domNode = txDomNodeRefMap.current[nextTx.tx_id];
      if (!domNode) return;
      domNode.focus();
    },
    [pendingTxs, txs]
  );

  useHotkeys('j', () => focusTxDomNode(increment), [txs, pendingTxs]);
  useHotkeys('k', () => focusTxDomNode(decrement), [txs, pendingTxs]);

  if (!address) return <Spinner />;

  const meetsMinStackingThreshold =
    balance !== null &&
    stackingDetails !== null &&
    new BigNumber(balance).isGreaterThan(stackingDetails.min_amount_ustx);

  const txCount = txs.length + pendingTxs.length;

  const transactionList = (
    <>
      <TransactionList
        txCount={txCount}
        loading={loadingTxs}
        node={activeNode}
        error={txListFetchError}
      >
        {pendingTxs.map(pTx => (
          <TransactionListItemPending
            domNodeMapRef={txDomNodeRefMap}
            activeTxIdRef={focusedTxIdRef}
            key={pTx.tx_id}
            tx={pTx}
            onSelectTx={openInExplorer}
          />
        ))}
        {txs.map(tx => (
          <TransactionListItem
            domNodeMapRef={txDomNodeRefMap}
            activeTxIdRef={focusedTxIdRef}
            key={tx.tx_id}
            tx={tx}
            address={address}
            onSelectTx={openInExplorer}
          />
        ))}
      </TransactionList>
    </>
  );
  const balanceCard = (
    <BalanceCard
      balance={balance}
      onSelectStacking={() => history.push(routes.STACKING)}
      onSelectSend={() => dispatch(homeActions.openTxModal())}
      onSelectReceive={() => dispatch(homeActions.openReceiveModal())}
      onRequestTestnetStx={async () => new Api(activeNode.url).getFaucetStx(address)}
    />
  );

  const card = meetsMinStackingThreshold ? <StackingParticipationCard /> : <StackingPromoCard />;

  const stackingRewardCard = (
    <StackingRewardCard lifetime="0.0281 Bitcoin (sample)" lastCycle="0.000383 Bitcoin (sample)" />
  );

  return (
    <>
      {receiveModalOpen && <ReceiveStxModal address={address} />}
      {txModalOpen && <TransactionModal balance={balance || '0'} address={address} />}

      <HomeLayout
        transactionList={transactionList}
        balanceCard={balanceCard}
        stackingCard={card}
        stackingRewardCard={stackingRewardCard}
      />
    </>
  );
};