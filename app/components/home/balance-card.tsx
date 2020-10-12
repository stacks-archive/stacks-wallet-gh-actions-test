import React, { FC, useState } from 'react';
import { Box, Button, Text, ArrowIcon, EncryptionIcon, Flex } from '@blockstack/ui';

import { features } from '@constants/index';
import { toHumanReadableStx } from '@utils/unit-convert';
import { safeAwait } from '@utils/safe-await';
import { delay } from '@utils/delay';

interface BalanceCardProps {
  balance: string | null;
  onSelectSend(): void;
  onSelectReceive(): void;
  onSelectStacking(): void;
  onRequestTestnetStx(): Promise<any>;
}

export const BalanceCard: FC<BalanceCardProps> = props => {
  const { balance, onSelectReceive, onSelectSend, onRequestTestnetStx, onSelectStacking } = props;

  const [requestingTestnetStx, setRequestingTestnetStx] = useState(false);
  const requestTestnetStacks = async () => {
    setRequestingTestnetStx(true);
    await safeAwait(Promise.allSettled([onRequestTestnetStx(), delay(1500)]));
    setRequestingTestnetStx(false);
  };
  return (
    <Box>
      <Text textStyle="body.large.medium" display="block">
        Total balance
      </Text>
      <Text fontSize="40px" lineHeight="56px" fontWeight="bold" letterSpacing="-0.01em">
        {balance === null ? '–' : toHumanReadableStx(balance)}
      </Text>

      {features.stackingEnabled && (
        <Flex alignItems="center" mt="tight" color="ink.600" fontSize={['14px', '16px']}>
          <EncryptionIcon size="16px" color="#409EF3" display={['none', 'block']} mr="tight" />
          <Text onClick={onSelectStacking} cursor="pointer" borderBottom="1px dotted #677282">
            320,000.00 STX locked
          </Text>
          <Text children="·" mx="base-tight" />
          <Text>40,000.00 STX available</Text>
        </Flex>
      )}

      <Box mt="loose">
        <Button size="md" onClick={onSelectSend} isDisabled={balance === '0' || balance === null}>
          <ArrowIcon direction="up" mr="base-tight" />
          Send
        </Button>
        <Button size="md" ml="tight" onClick={onSelectReceive}>
          <ArrowIcon direction="down" mr="base-tight" />
          Receive
        </Button>
        <Button mode="secondary" size="md" ml="tight" onClick={requestTestnetStacks}>
          <Box
            mr="extra-tight"
            fontSize="18px"
            left="-4px"
            position="relative"
            display={['none', 'none', 'block']}
          >
            🚰
          </Box>
          {requestingTestnetStx ? 'Requesting faucet' : 'Get testnet STX'}
        </Button>
      </Box>
    </Box>
  );
};