import { cn } from "cn";
import type * as React from "react";
import {
	composeRenderProps,
	Input as InputPrimitive,
} from "react-aria-components";

function Input({
	className,
	type,
	...props
}: React.ComponentProps<typeof InputPrimitive>) {
	return (
		<InputPrimitive
			type={type}
			data-slot="input"
			className={composeRenderProps(className, (className) =>
				cn(
					// spotstrap's text input; it shows aria-invalid itself.
					"input",
					className,
				),
			)}
			{...props}
		/>
	);
}

export { Input };
