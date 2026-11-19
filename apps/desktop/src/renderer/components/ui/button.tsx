import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type * as React from "react";
import {
	Button as ButtonPrimitive,
	type ButtonProps as ButtonPrimitiveProps,
	Link as LinkPrimitive,
	type LinkProps as LinkPrimitiveProps,
} from "react-aria-components";

// spotstrap's button (`btn`): 44 px tall, or 36 px with a 44 px hit area
// (`btn-compact`). It reads react-aria's data-pressed, data-focus-visible and
// data-disabled itself.
const buttonVariants = cva("btn", {
	variants: {
		variant: {
			default: "",
			outline: "btn-outline",
			secondary: "btn-secondary",
			ghost: "btn-ghost",
			destructive: "btn-destructive",
			link: "btn-link",
		},
		size: {
			default: "",
			xs: "btn-compact",
			sm: "btn-compact",
			lg: "",
			icon: "btn-icon",
			"icon-xs": "btn-icon btn-compact",
			"icon-sm": "btn-icon btn-compact",
			"icon-lg": "btn-icon",
		},
	},
	defaultVariants: {
		variant: "default",
		size: "default",
	},
});

function Button({
	className,
	variant = "default",
	size = "default",
	...props
}: Omit<ButtonPrimitiveProps, "className"> &
	React.RefAttributes<HTMLButtonElement> &
	VariantProps<typeof buttonVariants> & {
		className?: string;
	}) {
	return (
		<ButtonPrimitive
			data-slot="button"
			data-variant={variant}
			data-size={size}
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

function LinkButton({
	className,
	variant = "default",
	size = "default",
	...props
}: Omit<LinkPrimitiveProps, "className"> &
	VariantProps<typeof buttonVariants> & {
		className?: string;
	}) {
	return (
		<LinkPrimitive
			data-slot="button"
			data-variant={variant}
			data-size={size}
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button, LinkButton, buttonVariants };
