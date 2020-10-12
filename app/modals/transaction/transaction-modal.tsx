import React, { FC, useState, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useFormik } from 'formik';
import * as yup from 'yup';
import BN from 'bn.js';
import { BigNumber } from 'bignumber.js';
import { Modal } from '@blockstack/ui';
import { useHistory } from 'react-router-dom';
import { createMessageSignature } from '@blockstack/stacks-transactions/lib/authorization';
import {
  makeSTXTokenTransfer,
  MEMO_MAX_LENGTH_BYTES,
  makeUnsignedSTXTokenTransfer,
  StacksTestnet,
} from '@blockstack/stacks-transactions';
import BlockstackApp, { LedgerError } from '@zondax/ledger-blockstack';
import { useHotkeys } from 'react-hotkeys-hook';

import { RootState } from '@store/index';
import routes from '@constants/routes.json';
import { validateStacksAddress } from '@utils/get-stx-transfer-direction';

import { homeActions } from '@store/home/home.reducer';
import {
  selectEncryptedMnemonic,
  selectSalt,
  decryptSoftwareWallet,
  selectWalletType,
} from '@store/keys';
import { validateAddressChain } from '../../crypto/validate-address-net';
import { broadcastStxTransaction } from '@store/transaction';
import { stxToMicroStx, microStxToStx } from '@utils/unit-convert';

import { stacksNetwork } from '../../environment';
import {
  TxModalHeader,
  TxModalFooter,
  TxModalButton,
  modalStyle,
} from './transaction-modal-layout';
import { TxModalForm } from './steps/transaction-form';
import { DecryptWalletForm } from './steps/decrypt-wallet-form';
import { SignTxWithLedger } from './steps/sign-tx-with-ledger';
import { selectPublicKey } from '@store/keys/keys.reducer';
import { FailedBroadcastError } from './steps/failed-broadcast-error';
import { LedgerConnectStep } from '@hooks/use-ledger';
import { PreviewTransaction } from './steps/preview-transaction';
import { safeAwait } from '../../utils/safe-await';
import log from 'electron-log';

interface TxModalProps {
  balance: string;
  address: string;
}

enum TxModalStep {
  DescribeTx,
  PreviewTx,
  DecryptWalletAndSend,
  SignWithLedgerAndSend,
  NetworkError,
}

type ModalComponents = () => Record<'header' | 'body' | 'footer', JSX.Element>;

export const TransactionModal: FC<TxModalProps> = ({ balance, address }) => {
  const dispatch = useDispatch();
  const history = useHistory();
  useHotkeys('esc', () => void dispatch(homeActions.closeTxModal()));
  const [step, setStep] = useState(TxModalStep.DescribeTx);
  const [fee, setFee] = useState(new BN(0));
  const [amount, setAmount] = useState(new BigNumber(0));
  const [password, setPassword] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [total, setTotal] = useState(new BigNumber(0));
  const [decryptionError, setDecryptionError] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [blockstackApp, setBlockstackApp] = useState<null | BlockstackApp>(null);

  const interactedWithSendAllBtn = useRef(false);

  const { encryptedMnemonic, salt, walletType, publicKey } = useSelector((state: RootState) => ({
    salt: selectSalt(state),
    encryptedMnemonic: selectEncryptedMnemonic(state),
    walletType: selectWalletType(state),
    publicKey: selectPublicKey(state),
  }));

  type CreateTxOptions = {
    recipient: string;
    network: StacksTestnet;
    amount: BN;
    memo: string;
  };

  const createSoftwareWalletTx = useCallback(
    async (options: CreateTxOptions) => {
      if (!password || !encryptedMnemonic || !salt) {
        throw new Error('One of `password`, `encryptedMnemonic` or `salt` is missing');
      }
      const { privateKey } = await decryptSoftwareWallet({
        ciphertextMnemonic: encryptedMnemonic,
        salt,
        password,
      });
      return makeSTXTokenTransfer({ ...options, senderKey: privateKey });
    },
    [encryptedMnemonic, password, salt]
  );

  const createLedgerWalletTx = useCallback(
    async (options: CreateTxOptions & { publicKey: Buffer }) => {
      if (!publicKey || !blockstackApp)
        throw new Error('`publicKey` or `blockstackApp` is not defined');

      const unsignedTx = await makeUnsignedSTXTokenTransfer({
        ...options,
        publicKey: publicKey.toString('hex'),
      });
      const resp = await blockstackApp.sign(`m/44'/5757'/0'/0/0`, unsignedTx.serialize());

      if (resp.returnCode !== LedgerError.NoErrors) {
        throw new Error('Ledger responded with errors');
      }
      if (unsignedTx.auth.spendingCondition) {
        (unsignedTx.auth.spendingCondition as any).signature = createMessageSignature(
          resp.signatureVRS.toString('hex')
        );
      }
      return unsignedTx;
      // return unsignedTx.setSignature(resp.signatureVRS.toString('hex'));
    },
    [blockstackApp, publicKey]
  );

  const broadcastTx = async () => {
    setHasSubmitted(true);

    const txDetails = {
      recipient: form.values.recipient,
      network: stacksNetwork,
      amount: new BN(stxToMicroStx(form.values.amount).toString()),
      memo: form.values.memo,
    };

    const broadcastActions = {
      amount,
      onBroadcastSuccess: closeModal,
      onBroadcastFail: () => setStep(TxModalStep.NetworkError),
    };

    if (walletType === 'software') {
      setIsDecrypting(true);

      const [error, transaction] = await safeAwait(createSoftwareWalletTx(txDetails));

      if (error) {
        setIsDecrypting(false);
        setDecryptionError('Unable to decrypt wallet');
        return;
      }

      if (transaction) {
        setIsDecrypting(false);
        dispatch(broadcastStxTransaction({ ...broadcastActions, transaction }));
      }
    }

    if (walletType === 'ledger') {
      if (publicKey === null) {
        log.error('Tried to create Ledger transaction without persisted private key');
        return;
      }

      const [error, transaction] = await safeAwait(
        createLedgerWalletTx({ ...txDetails, publicKey })
      );

      if (error) {
        setHasSubmitted(false);
        return;
      }

      if (transaction) {
        dispatch(broadcastStxTransaction({ ...broadcastActions, transaction }));
      }
    }
  };

  const totalIsMoreThanBalance = total.isGreaterThan(balance);

  const exceedsMaxLengthBytes = (string: string, maxLengthBytes: number): boolean =>
    string ? Buffer.from(string).length > maxLengthBytes : false;

  const form = useFormik({
    validateOnChange: true,
    validateOnMount: !interactedWithSendAllBtn.current,
    validateOnBlur: !interactedWithSendAllBtn.current,
    initialValues: {
      recipient: '',
      amount: '',
      memo: '',
    },
    validationSchema: yup.object().shape({
      recipient: yup
        .string()
        .test('test-is-stx-address', 'Must be a valid Stacks Address', (value = '') =>
          value === null ? false : validateStacksAddress(value)
        )
        .test('test-is-for-valid-chain', 'Address is for incorrect network', (value = '') =>
          value === null ? false : validateAddressChain(value)
        )
        .test(
          'test-is-not-my-address',
          'You cannot send Stacks to yourself',
          value => value !== address
        ),
      amount: yup
        .number()
        .typeError('Amount of STX must be described as number')
        .positive('You cannot send a negative amount of STX')
        .test(
          'test-has-less-than-or-equal-to-6-decimal-places',
          'STX do not have more than 6 decimal places',
          value => {
            if (value === null || value === undefined) return false;
            // Explicit base ensures BigNumber doesn't use exponential notation
            const decimals = new BigNumber(value).toString(10).split('.')[1];
            return decimals === undefined || decimals.length <= 6;
          }
        )
        .test(
          'test-address-has-enough-balance',
          'Cannot send more STX than available balance',
          value => {
            if (value === null || value === undefined) return false;
            // If there's no input, pass this test,
            // otherwise it'll render the error for this test
            if (value === undefined) return true;
            const enteredAmount = stxToMicroStx(value);
            // console.log(enteredAmount.toString());
            // console.log(balance.toString());
            return enteredAmount.isLessThanOrEqualTo(balance);
          }
        )
        .required(),
      memo: yup
        .string()
        .test('test-max-memo-length', 'Transaction memo cannot exceed 34 bytes', (value = '') =>
          value === null ? false : !exceedsMaxLengthBytes(value, MEMO_MAX_LENGTH_BYTES)
        ),
    }),
    onSubmit: async () => {
      setLoading(true);
      setDecryptionError(null);
      const demoTx = await makeSTXTokenTransfer({
        recipient: form.values.recipient,
        network: stacksNetwork,
        amount: new BN(stxToMicroStx(form.values.amount).toString()),
        //
        // SECURITY: find common burn address
        senderKey: 'f0bc18b8c5adc39c26e0fe686c71c7ab3cc1755a3a19e6e1eb84b55f2ede95da01',
      });
      const { amount, fee } = {
        amount: stxToMicroStx(form.values.amount),
        fee: demoTx.auth.spendingCondition?.fee as BN,
      };
      setFee(fee);
      setTotal(amount.plus(fee.toString()));
      setAmount(amount);
      setStep(TxModalStep.PreviewTx);
      setLoading(false);
    },
  });

  const [calculatingMaxSpend, setCalculatingMaxSpend] = useState(false);
  const [ledgerConnectStep, setLedgerConnectStep] = useState(LedgerConnectStep.Disconnected);

  const closeModal = () => dispatch(homeActions.closeTxModal());

  const proceedToSignTransactionStep = () =>
    walletType === 'software'
      ? setStep(TxModalStep.DecryptWalletAndSend)
      : setStep(TxModalStep.SignWithLedgerAndSend);

  const updateAmountFieldToMaxBalance = async () => {
    interactedWithSendAllBtn.current = true;
    setCalculatingMaxSpend(true);
    const [error, demoTx] = await safeAwait(
      makeSTXTokenTransfer({
        // SECURITY: remove hardcoded test address
        recipient: form.values.recipient || 'ST3NR0TBES0A94R38EJ8TC1TGWPN9T1SHVW03ZBD7',
        network: stacksNetwork,
        amount: new BN(stxToMicroStx(form.values.amount).toString()),
        // SECURITY: find common burn address
        senderKey: 'f0bc18b8c5adc39c26e0fe686c71c7ab3cc1755a3a19e6e1eb84b55f2ede95da01',
      })
    );
    if (error) setCalculatingMaxSpend(false);
    if (demoTx) {
      const fee = demoTx.auth.spendingCondition?.fee as BN;
      const balanceLessFee = new BigNumber(balance).minus(fee.toString());
      if (balanceLessFee.isLessThanOrEqualTo(0)) {
        form.setFieldTouched('amount');
        form.setFieldError('amount', 'Your balance is not sufficient to cover the transaction fee');
        setCalculatingMaxSpend(false);
        return;
      }
      form.setValues({
        ...form.values,
        amount: microStxToStx(balanceLessFee.toString()).toString(),
      });
      setCalculatingMaxSpend(false);
      setTimeout(() => (interactedWithSendAllBtn.current = false), 1000);
    }
  };

  const setBlockstackAppCallback = useCallback(
    blockstackApp => setBlockstackApp(blockstackApp),
    []
  );
  const updateStep = useCallback(step => setLedgerConnectStep(step), []);

  const txFormStepMap: Record<TxModalStep, ModalComponents> = {
    [TxModalStep.DescribeTx]: () => ({
      header: <TxModalHeader onSelectClose={closeModal}>Send STX</TxModalHeader>,
      body: (
        <TxModalForm
          balance={balance}
          form={form}
          isCalculatingMaxSpend={calculatingMaxSpend}
          onSendEntireBalance={updateAmountFieldToMaxBalance}
        />
      ),
      footer: (
        <TxModalFooter>
          <TxModalButton mode="tertiary" onClick={closeModal}>
            Cancel
          </TxModalButton>
          <TxModalButton onClick={() => form.submitForm()} isLoading={loading}>
            Preview
          </TxModalButton>
        </TxModalFooter>
      ),
    }),
    [TxModalStep.PreviewTx]: () => ({
      header: <TxModalHeader onSelectClose={closeModal}>Preview transaction</TxModalHeader>,
      body: (
        <PreviewTransaction
          recipient={form.values.recipient}
          amount={amount.toString()}
          fee={fee.toString()}
          total={total.toString()}
          memo={form.values.memo}
          totalExceedsBalance={totalIsMoreThanBalance}
        />
      ),
      footer: (
        <TxModalFooter>
          <TxModalButton mode="tertiary" onClick={() => setStep(TxModalStep.DescribeTx)}>
            Go back
          </TxModalButton>
          <TxModalButton
            isLoading={loading}
            isDisabled={totalIsMoreThanBalance}
            onClick={proceedToSignTransactionStep}
          >
            Sign transaction and send
          </TxModalButton>
        </TxModalFooter>
      ),
    }),
    [TxModalStep.DecryptWalletAndSend]: () => ({
      header: <TxModalHeader onSelectClose={closeModal}>Confirm and send</TxModalHeader>,
      body: (
        <>
          <DecryptWalletForm
            onSetPassword={password => setPassword(password)}
            onForgottenPassword={() => {
              closeModal();
              history.push(routes.SETTINGS);
            }}
            hasSubmitted={hasSubmitted}
            decryptionError={decryptionError}
          />
        </>
      ),
      footer: (
        <TxModalFooter>
          <TxModalButton mode="tertiary" onClick={() => setStep(TxModalStep.PreviewTx)}>
            Go back
          </TxModalButton>
          <TxModalButton
            isLoading={isDecrypting}
            isDisabled={isDecrypting}
            onClick={() => broadcastTx()}
          >
            Send transaction
          </TxModalButton>
        </TxModalFooter>
      ),
    }),
    [TxModalStep.SignWithLedgerAndSend]: () => ({
      header: <TxModalHeader onSelectClose={closeModal}>Confirm on your Ledger</TxModalHeader>,
      body: <SignTxWithLedger onLedgerConnect={setBlockstackAppCallback} updateStep={updateStep} />,
      footer: (
        <TxModalFooter>
          <TxModalButton
            mode="tertiary"
            onClick={() => {
              setHasSubmitted(false);
              setStep(TxModalStep.PreviewTx);
            }}
          >
            Go back
          </TxModalButton>
          <TxModalButton
            isDisabled={
              blockstackApp === null ||
              hasSubmitted ||
              ledgerConnectStep !== LedgerConnectStep.ConnectedAppOpen
            }
            isLoading={hasSubmitted}
            onClick={() => {
              if (blockstackApp === null) return;
              void broadcastTx();
            }}
          >
            Sign transaction
          </TxModalButton>
        </TxModalFooter>
      ),
    }),
    [TxModalStep.NetworkError]: () => ({
      header: <TxModalHeader onSelectClose={closeModal} />,
      body: <FailedBroadcastError />,
      footer: (
        <TxModalFooter>
          <TxModalButton mode="tertiary" onClick={closeModal}>
            Close
          </TxModalButton>
          <TxModalButton onClick={() => setStep(TxModalStep.DescribeTx)}>Try again</TxModalButton>
        </TxModalFooter>
      ),
    }),
  };

  const { header, body, footer } = txFormStepMap[step]();

  return (
    <Modal isOpen headerComponent={header} footerComponent={footer} {...modalStyle}>
      {body}
    </Modal>
  );
};