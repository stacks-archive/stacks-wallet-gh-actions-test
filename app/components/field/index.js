import React from "react";
import { Flex, Type, Input, Tooltip } from "blockstack-ui/dist";
import { Copy } from "@components/copy";
import { connect } from "react-redux";
import { selectWalletBalance } from "@stores/selectors/wallet";
import { LinkIcon } from "mdi-react";
import { Hover, State } from "react-powerplug";
const { shell } = require("electron");
import { microToStacks } from "@utils/utils";

const Link = ({ value, ...rest }) => (
  <Hover>
    {({ hovered, bind }) => (
      <Flex
        color="hsl(205, 30%, 70%)"
        opacity={hovered ? 1 : 0.5}
        target="_blank"
        alignItems="center"
        justifyContent="center"
        transition={1}
        cursor="pointer"
        onClick={() => shell.openExternal(value)}
        {...rest}
        {...bind}
      >
        <Tooltip text="View in Explorer">
          <Flex p={1}>
            <LinkIcon />
          </Flex>
        </Tooltip>
      </Flex>
    )}
  </Hover>
);

const mapStateToProps = state => ({
  balance: selectWalletBalance(state)
});
const Label = ({ ...rest }) => (
  <Type pb={2} fontWeight={500} fontSize={1} is="label" {...rest} />
);
/**
 * Field
 * @param {any} label - The label (typically a string)
 * @param {any} overlay - Text to overlay input eg STX
 * @param {string} value - text value
 * @param {boolean} disabled
 * @param {boolean} copy - to enable copy and paste
 * @param {object} rest - to enable copy and paste
 * @param {string} variant - to enable copy and paste
 */
const Field = ({
  label,
  overlay,
  disabled = false,
  copy,
  value,
  variant,
  link,
  error,
  ...rest
}) => {
  const disabledProps = disabled
    ? {
        disabled,
        bg: "blue.light"
      }
    : {};

  const errorProps = error
    ? {
        borderColor: "#F27D66"
      }
    : {};
  return (
    <Flex flexDirection={"column"} pb={5} width={1} flexGrow={1} flexShrink={0}>
      <Flex justifyContent="space-between" alignItems="center">
        <Type pb={2} fontWeight={500} fontSize={1} is="label">
          {label}
        </Type>
        {error ? (
          <Type
            color="#F27D66"
            textAlign="right"
            pb={2}
            fontWeight={500}
            fontSize={1}
          >
            {error}
          </Type>
        ) : null}
      </Flex>
      <Flex position="relative" width="100%">
        {copy ? (
          <Copy position="absolute" height="100%" value={value} right={0} />
        ) : null}
        {link ? (
          <Link position="absolute" height="100%" value={link} right={40} />
        ) : null}
        {overlay ? (
          <Type
            pr={4}
            position="absolute"
            height={"100%"}
            display="inline-flex"
            alignItems="center"
            top="0"
            right={0}
            color="hsl(205, 30%, 70%)"
          >
            {overlay}
          </Type>
        ) : null}
        <Input
          width="100%"
          flexGrow={1}
          value={value}
          pr={copy && link ? 80 : copy || link ? 38 : undefined}
          variant={variant}
          {...disabledProps}
          {...errorProps}
          {...rest}
        />
      </Flex>
    </Flex>
  );
};

const BalanceField = connect(mapStateToProps)(({ balance, value, ...rest }) => (
  <Flex flexDirection={"column"} flexShrink={0} pb={5}>
    <Type pb={2} fontWeight={500} fontSize={1} is="label">
      Available to Send
    </Type>
    <Flex
      border={1}
      borderColor="blue.mid"
      bg="blue.light"
      borderRadius={6}
      overflow="hidden"
    >
      <Flex px={3} height={48} flexGrow={1} alignItems="center">
        Stacks Balance
      </Flex>
      <Flex
        alignItems="center"
        px={3}
        height={48}
        borderLeft={1}
        borderColor="blue.mid"
        bg="white"
      >
        <Type>{microToStacks(balance)}</Type>
        <Type color="hsl(205, 30%, 70%)" pl={2}>
          STX
        </Type>
      </Flex>
    </Flex>
  </Flex>
));

const StaticField = ({ ...rest }) => (
  <Field width={1} disabled copy {...rest} />
);

export { Field, BalanceField, Label, StaticField };
